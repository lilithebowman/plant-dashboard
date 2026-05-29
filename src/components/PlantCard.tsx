// PlantCard.tsx
import React, { useEffect, useState } from "react";
import { Plant } from "../types/plant";
import { formatReadingTime } from "../utils/time";
import { fetchPlantSnapshot, getMoistureEndpoint } from "../services/api";

type Props = {
	plant: Plant;
	onManage: (plant: Plant) => void;
	onOpenHistory: (plant: Plant) => void;
};

export const PlantCard: React.FC<Props> = ({ plant, onManage, onOpenHistory }) => {
	const [snapshot, setSnapshot] = useState<Plant>(plant);

	useEffect(() => {
		setSnapshot(plant);
	}, [plant]);

	// Optional: poll backend every N seconds for new moisture
	useEffect(() => {
		const id = setInterval(async () => {
			try {
				const update = await fetchPlantSnapshot(plant.id);
				setSnapshot((prev) => ({ ...prev, ...update }));
			} catch {
				// Keep the previous snapshot if polling fails.
			}
		}, 15000); // 15s
		return () => clearInterval(id);
	}, [plant.id]);

	const handleCopyApi = async () => {
		const url = getMoistureEndpoint(snapshot.uuid);
		await navigator.clipboard.writeText(url);
	};

	const updatedLabel = snapshot.lastUpdated
		? `Updated ${formatReadingTime(snapshot.lastUpdated)}`
		: "Waiting for first reading";

	const moistureLabel =
		snapshot.moisture == null ? "--" : `${snapshot.moisture}%`;

	return (
		<div
			className="plant-card plant-card--interactive"
			onClick={() => onOpenHistory(snapshot)}
			role="button"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpenHistory(snapshot);
				}
			}}
		>
			<div className="plant-card__header-row">
				<div>
					{snapshot.source ? (
						<p className="plant-card__source">{snapshot.source.toUpperCase()}</p>
					) : null}
					<h2 className="plant-card__title">{snapshot.name}</h2>
				</div>
				<button
					type="button"
					className="plant-card__edit-btn"
					onClick={(event) => {
						event.stopPropagation();
						onManage(snapshot);
					}}
				>
					Manage
				</button>
			</div>
			<p className="plant-card__updated">{updatedLabel}</p>

			<div className="plant-card__moisture">{moistureLabel}</div>

			<div className="plant-card__footer">
				<span className="plant-card__snapshot-label">
					Latest moisture snapshot
				</span>
				<button
					className="plant-card__copy-btn"
					onClick={(event) => {
						event.stopPropagation();
						void handleCopyApi();
					}}
				>
					Copy API
				</button>
			</div>
		</div>
	);
};
