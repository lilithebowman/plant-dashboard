import React from "react";
import { Plant, PlantReading } from "../types/plant";

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

type Props = {
	plant: Plant;
	readings: PlantReading[];
	loading: boolean;
	error: string | null;
	onClose: () => void;
};

export const PlantHistoryDialog: React.FC<Props> = ({
	plant,
	readings,
	loading,
	error,
	onClose,
}) => {
	const width = 640;
	const height = 140;
	const path = buildSparklinePath(readings, width, height);

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
							<strong>Last {readings.length} readings</strong>
						</div>
						<div className="history-chart-card__legend">
							<span>0%</span>
							<span>100%</span>
						</div>
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
							{readings.map((reading, index) => {
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
