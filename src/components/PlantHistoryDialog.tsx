import React from "react";
import { Plant, PlantReading } from "../types/plant";
import { PlantHistoryRange } from "../services/api";

function buildSparklinePath(readings: PlantReading[], width: number, height: number): string {
	if (readings.length === 0) {
		return "";
	}

	const points = readings.map((reading, index) => {
		const x = readings.length === 1 ? width / 2 : (index / (readings.length - 1)) * width;
		const percent = reading.moisturePercent ?? 0;
		const y = height - (percent / 100) * height;
		return `${x},${y}`;
	});

	return `M ${points.join(" L ")}`;
}

function buildMarkerIndices(totalPoints: number, maxMarkers = 24): number[] {
	if (totalPoints <= 0) {
		return [];
	}

	if (totalPoints <= maxMarkers) {
		return Array.from({ length: totalPoints }, (_, index) => index);
	}

	const indices = new Set([0, totalPoints - 1]);
	const middleMarkers = maxMarkers - 2;
	for (let i = 1; i <= middleMarkers; i += 1) {
		const normalized = i / (middleMarkers + 1);
		indices.add(Math.round(normalized * (totalPoints - 1)));
	}

	return Array.from(indices).sort((a, b) => a - b);
}

type Props = {
	plant: Plant;
	readings: PlantReading[];
	loading: boolean;
	error: string | null;
	range: PlantHistoryRange;
	onChangeRange: (range: PlantHistoryRange) => void;
	onClose: () => void;
};

const RANGE_LABELS: Record<PlantHistoryRange, string> = {
	last60: "Last 60 readings",
	week: "Last week",
	month: "Last month",
	year: "Last year",
};

export const PlantHistoryDialog: React.FC<Props> = ({
	plant,
	readings,
	loading,
	error,
	range,
	onChangeRange,
	onClose,
}) => {
	const width = 640;
	const height = 140;
	const path = buildSparklinePath(readings, width, height);
	const markerIndices = buildMarkerIndices(readings.length, 24);

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div className="modal-panel modal-panel-wide" onClick={(event) => event.stopPropagation()} role="dialog">
				<div className="modal-head">
					<div>
						<p className="modal-eyebrow">History</p>
						<h2>{plant.name}</h2>
					</div>
					<button type="button" className="modal-close" onClick={onClose}>
						Close
					</button>
				</div>

				<div className="history-chart-card">
					<div className="history-chart-card__head">
						<div>
							<span>Historical moisture</span>
							<strong>{RANGE_LABELS[range]}</strong>
						</div>
						<div className="history-chart-card__legend">
							<span>0%</span>
							<span>100%</span>
						</div>
					</div>

					<div className="history-range-tabs" role="tablist" aria-label="History range">
						{([
							"last60",
							"week",
							"month",
							"year",
						] as PlantHistoryRange[]).map((option) => (
							<button
								key={option}
								type="button"
								className={`history-range-tab${range === option ? " is-active" : ""}`}
								onClick={() => onChangeRange(option)}
								disabled={loading}
							>
								{RANGE_LABELS[option]}
							</button>
						))}
					</div>

					{loading ? (
						<p className="history-chart-card__empty">Loading history…</p>
					) : error ? (
						<p className="dashboard__error">{error}</p>
					) : readings.length === 0 ? (
						<p className="history-chart-card__empty">No readings yet.</p>
					) : (
						<svg className="history-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Moisture history chart">
							{[0, 25, 50, 75, 100].map((value) => {
								const y = height - (value / 100) * height;
								return <line key={value} x1="0" y1={y} x2={width} y2={y} className="history-chart__grid" />;
							})}
							<path d={path} className="history-chart__line" />
							{markerIndices.map((index) => {
								const reading = readings[index];
								const x = readings.length === 1 ? width / 2 : (index / (readings.length - 1)) * width;
								const percent = reading.moisturePercent ?? 0;
								const y = height - (percent / 100) * height;
								return <circle key={`${reading.receivedAt}-${index}`} cx={x} cy={y} r="3" className="history-chart__point" />;
							})}
						</svg>
					)}
				</div>

				<div className="history-reading-list">
					{readings.slice().reverse().map((reading, index) => (
						<div key={`${reading.receivedAt}-${index}`} className="history-reading-row">
							<div>
								<strong>
									{reading.moisturePercent == null
										? "--"
										: `${Math.round(reading.moisturePercent)}%`}
								</strong>
								<span>{reading.source}</span>
							</div>
							<div>
								<strong>{reading.rawValue}</strong>
								<span>{new Date(reading.receivedAt).toLocaleString()}</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
