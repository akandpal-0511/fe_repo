"""
Forecast engine — short-horizon (6-48 h) point forecasts + confidence bands.

Three candidate models are fitted and evaluated via time-series cross-validation
(last 20% of history as hold-out). The winner is chosen by RMSE and used for
the final forecast.

Models
------
1. Holt double exponential smoothing  — fast baseline, handles level + trend
2. Prophet                            — captures daily/weekly seasonality
3. LightGBM lag model                 — gradient-boosted trees on lag features,
                                        captures non-linear sensor behaviour

Public API
----------
forecast_tag(tag, start, end, horizon_hours, lo, hi)
    → ForecastResult dict including breach ETA, warning level, and which model won.
"""

import logging
import math
import warnings

import numpy as np
import pandas as pd

from db import getTrendData, getAllTagProfiles

logger = logging.getLogger(__name__)

RESAMPLE_FREQ       = "1h"
MIN_TRAINING_HOURS  = 48   # need enough for CV + seasonality detection
CV_HOLDOUT_FRAC     = 0.20  # last 20% used for model selection


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _resample_tag(df: pd.DataFrame, tag: str) -> pd.Series:
    sub = df[df["Tag"] == tag].copy()
    sub["Timestamp_AZ"] = pd.to_datetime(sub["Timestamp_AZ"], utc=True)
    sub["Value"] = pd.to_numeric(sub["Value"], errors="coerce")
    return (
        sub.set_index("Timestamp_AZ")["Value"]
        .resample(RESAMPLE_FREQ)
        .mean()
        .interpolate(method="time", limit=3)
        .dropna()
    )


def _limit(v) -> float | None:
    if v is None or (isinstance(v, float) and (math.isnan(v) or v <= -999)):
        return None
    return float(v)


def _rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    mask = ~(np.isnan(actual) | np.isnan(predicted))
    if mask.sum() == 0:
        return float("inf")
    return float(np.sqrt(np.mean((actual[mask] - predicted[mask]) ** 2)))


def _breach_eta(forecast_vals: np.ndarray, lo: float | None, hi: float | None) -> dict:
    result = {"hours": None, "direction": None, "projected_value": None, "warning_level": "ok"}
    for i, v in enumerate(forecast_vals):
        if hi is not None and v > hi:
            result.update({"hours": i + 1, "direction": "high",
                           "projected_value": round(float(v), 3), "warning_level": "alarm"})
            return result
        if lo is not None and v < lo:
            result.update({"hours": i + 1, "direction": "low",
                           "projected_value": round(float(v), 3), "warning_level": "alarm"})
            return result
    last = float(forecast_vals[-1]) if len(forecast_vals) else None
    if last is not None:
        if hi is not None and hi != 0 and last > hi * 0.90:
            result["warning_level"] = "warn"
        elif lo is not None and lo != 0 and last < lo * 1.10:
            result["warning_level"] = "warn"
    return result


def _forecast_timestamps(last_ts: pd.Timestamp, n: int) -> list[str]:
    freq = pd.tseries.frequencies.to_offset(RESAMPLE_FREQ)
    return [(last_ts + freq * (i + 1)).isoformat() for i in range(n)]


# ── Model 1 — Holt double exponential smoothing ────────────────────────────────

def _fit_holt(train: np.ndarray, horizon: int) -> tuple[np.ndarray, np.ndarray, float]:
    """Returns (cv_predictions_on_holdout, forecast_mean, resid_std)."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing as HW

    hold = max(horizon, int(len(train) * CV_HOLDOUT_FRAC))
    cv_train = train[:-hold]
    cv_test  = train[-hold:][:horizon]

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        cv_model = HW(cv_train, trend="add", initialization_method="estimated").fit(optimized=True)
    cv_pred = cv_model.forecast(len(cv_test))[:len(cv_test)]

    # Full-data fit for final forecast
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        full_model = HW(train, trend="add", initialization_method="estimated").fit(optimized=True)
    forecast = full_model.forecast(horizon)
    resid_std = float(np.std(full_model.resid)) if len(full_model.resid) > 1 else 0.0
    return cv_pred, forecast, resid_std


# ── Model 2 — Prophet ──────────────────────────────────────────────────────────

def _fit_prophet(series: pd.Series, horizon: int) -> tuple[np.ndarray, np.ndarray, float]:
    from prophet import Prophet  # lazy import — only if needed

    hold = max(horizon, int(len(series) * CV_HOLDOUT_FRAC))
    cv_series = series.iloc[:-hold]
    cv_test   = series.iloc[-hold:][:horizon].values

    def _to_df(s: pd.Series) -> pd.DataFrame:
        df = s.reset_index()
        df.columns = ["ds", "y"]
        df["ds"] = df["ds"].dt.tz_localize(None)
        return df

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m_cv = Prophet(daily_seasonality=True, weekly_seasonality=True,
                       yearly_seasonality=False, uncertainty_samples=0)
        m_cv.fit(_to_df(cv_series))

    future_cv = m_cv.make_future_dataframe(periods=len(cv_test), freq="h", include_history=False)
    cv_pred = m_cv.predict(future_cv)["yhat"].values[:len(cv_test)]

    # Full-data fit
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m_full = Prophet(daily_seasonality=True, weekly_seasonality=True,
                         yearly_seasonality=False, uncertainty_samples=200)
        m_full.fit(_to_df(series))

    future = m_full.make_future_dataframe(periods=horizon, freq="h", include_history=False)
    pred_df = m_full.predict(future)
    forecast     = pred_df["yhat"].values[:horizon]
    resid_series = series.values - m_full.predict(_to_df(series))["yhat"].values
    resid_std    = float(np.std(resid_series))
    return cv_pred, forecast, resid_std


# ── Model 3 — LightGBM lag model ──────────────────────────────────────────────

_LAG_HOURS = [1, 2, 3, 6, 12, 24, 48]

def _make_lag_features(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    max_lag = max(_LAG_HOURS)
    X, y = [], []
    for i in range(max_lag, len(values)):
        row = [values[i - lag] for lag in _LAG_HOURS if i - lag >= 0]
        if len(row) == len(_LAG_HOURS):
            X.append(row)
            y.append(values[i])
    return np.array(X), np.array(y)


def _fit_lgbm(train: np.ndarray, horizon: int) -> tuple[np.ndarray, np.ndarray, float]:
    import lightgbm as lgb

    hold = max(horizon, int(len(train) * CV_HOLDOUT_FRAC))
    cv_train_arr = train[:-hold]
    cv_test_arr  = train[-hold:]
    max_lag = max(_LAG_HOURS)

    params = {
        "objective": "regression", "metric": "rmse",
        "num_leaves": 15, "learning_rate": 0.05,
        "n_estimators": 200, "verbose": -1,
    }

    def _train_model(arr: np.ndarray):
        X, y = _make_lag_features(arr)
        if len(X) < 10:
            return None
        ds = lgb.Dataset(X, label=y)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return lgb.train(params, ds, num_boost_round=200)

    cv_model = _train_model(cv_train_arr)
    if cv_model is None:
        return np.array([np.nan] * horizon), np.array([np.nan] * horizon), float("inf")

    # CV predictions — walk-forward one step at a time
    cv_buf = list(cv_train_arr)
    cv_pred = []
    for _ in range(min(horizon, len(cv_test_arr))):
        if len(cv_buf) < max_lag:
            cv_pred.append(np.nan)
            continue
        feats = np.array([[cv_buf[-lag] for lag in _LAG_HOURS]])
        p = float(cv_model.predict(feats)[0])
        cv_pred.append(p)
        cv_buf.append(cv_test_arr[len(cv_pred) - 1])

    # Full-data model
    full_model = _train_model(train)
    if full_model is None:
        return np.array(cv_pred), np.array([np.nan] * horizon), float("inf")

    buf = list(train)
    forecast = []
    for _ in range(horizon):
        feats = np.array([[buf[-lag] for lag in _LAG_HOURS]])
        p = float(full_model.predict(feats)[0])
        forecast.append(p)
        buf.append(p)

    X_tr, y_tr = _make_lag_features(train)
    resid = y_tr - full_model.predict(X_tr)
    resid_std = float(np.std(resid))

    return np.array(cv_pred), np.array(forecast), resid_std


# ── Model selection + final forecast ─────────────────────────────────────────

def _build_forecast_output(
    forecast_mean: np.ndarray,
    resid_std: float,
    last_ts: pd.Timestamp,
    horizon: int,
) -> list[dict]:
    z95 = 1.96
    timestamps = _forecast_timestamps(last_ts, horizon)
    out = []
    for i, (ts, v) in enumerate(zip(timestamps, forecast_mean)):
        spread = z95 * resid_std * math.sqrt(i + 1)
        out.append({
            "t":    ts,
            "v":    round(float(v), 4),
            "lo95": round(float(v) - spread, 4),
            "hi95": round(float(v) + spread, 4),
        })
    return out


# ── Public API ─────────────────────────────────────────────────────────────────

def forecast_tag(
    tag: str,
    start: str,
    end: str,
    horizon_hours: int = 12,
    lo: float | None = None,
    hi: float | None = None,
) -> dict:
    """
    Returns {
      tag, description, unit, lo, hi,
      model_used:  "holt" | "prophet" | "lgbm",
      model_scores: {holt: float, prophet: float, lgbm: float},
      history:  [{t: ISO, v: float}, ...],
      forecast: [{t: ISO, v: float, lo95: float, hi95: float}, ...],
      breach:   {hours, direction, projected_value, warning_level},
      error:    str|null
    }
    """
    lo = _limit(lo)
    hi = _limit(hi)

    # Pull metadata
    all_prof = getAllTagProfiles()
    mask = not all_prof.empty and (all_prof["Tag"] == tag).any()
    row  = all_prof[all_prof["Tag"] == tag].iloc[0] if mask else None
    description = row["Description"] if row is not None else tag
    unit        = (row["Unit"] or "") if row is not None else ""
    if lo is None and row is not None:
        lo = _limit(row.get("LowerLimit"))
    if hi is None and row is not None:
        hi = _limit(row.get("UpperLimit"))

    base = {
        "tag": tag, "description": description, "unit": unit, "lo": lo, "hi": hi,
        "model_used": None, "model_scores": {},
        "history": [], "forecast": [],
        "breach": _breach_eta(np.array([]), lo, hi),
        "error": None,
    }

    # Fetch data
    raw = getTrendData((tag,), start, end)
    if raw is None or raw.empty:
        base["error"] = "No data available for the selected date range."
        return base

    series = _resample_tag(raw, tag)
    if len(series) < MIN_TRAINING_HOURS:
        base["error"] = f"Need at least {MIN_TRAINING_HOURS} hours of data — only {len(series)} h found."
        return base

    base["history"] = [{"t": idx.isoformat(), "v": round(float(v), 4)}
                       for idx, v in series.items() if not math.isnan(v)]

    train   = series.values.astype(float)
    hold    = max(horizon_hours, int(len(train) * CV_HOLDOUT_FRAC))
    cv_test = train[-hold:][:horizon_hours]

    # ── Fit all three models ───────────────────────────────────────────────────
    scores: dict[str, float] = {}
    candidates: dict[str, tuple[np.ndarray, float]] = {}  # model → (forecast, resid_std)

    # Holt
    try:
        cv_holt, fc_holt, std_holt = _fit_holt(train, horizon_hours)
        scores["holt"] = _rmse(cv_test, cv_holt)
        candidates["holt"] = (fc_holt, std_holt)
    except Exception as e:
        logger.warning(f"Holt failed for {tag}: {e}")
        scores["holt"] = float("inf")

    # Prophet
    try:
        cv_prop, fc_prop, std_prop = _fit_prophet(series, horizon_hours)
        scores["prophet"] = _rmse(cv_test, cv_prop)
        candidates["prophet"] = (fc_prop, std_prop)
    except Exception as e:
        logger.warning(f"Prophet failed for {tag}: {e}")
        scores["prophet"] = float("inf")

    # LightGBM
    try:
        cv_lgbm, fc_lgbm, std_lgbm = _fit_lgbm(train, horizon_hours)
        scores["lgbm"] = _rmse(cv_test, cv_lgbm)
        candidates["lgbm"] = (fc_lgbm, std_lgbm)
    except Exception as e:
        logger.warning(f"LightGBM failed for {tag}: {e}")
        scores["lgbm"] = float("inf")

    # All failed
    finite = {k: v for k, v in scores.items() if v < float("inf")}
    if not finite:
        base["error"] = "All forecast models failed. Check logs for details."
        return base

    # ── Pick winner ────────────────────────────────────────────────────────────
    winner = min(finite, key=lambda k: finite[k])
    fc_mean, resid_std = candidates[winner]

    base["model_used"]   = winner
    # Cap inf scores to -1 sentinel so JSON serialization never produces null
    base["model_scores"] = {k: (round(v, 4) if v < 1e9 else -1.0) for k, v in scores.items()}
    base["forecast"]     = _build_forecast_output(fc_mean, resid_std, series.index[-1], horizon_hours)
    base["breach"]       = _breach_eta(fc_mean, lo, hi)
    return base
