// PlantCard.tsx
import React, { useEffect, useState } from "react";
import { Plant } from "../types/plant";
import { formatTimeSince } from "../utils/time";
import { fetchPlantSnapshot } from "../services/api";

type Props = {
	plant: Plant;
};

export const PlantCard: React.FC<Props> = ({ plant }) => {
	const [snapshot, setSnapshot] = useState<Plant>(plant);
	const [now, setNow] = useState<Date>(new Date());

	// Tick every second so “Updated HH:MM:SS” stays live
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	// Optional: poll backend every N seconds for new moisture
	useEffect(() => {
		const id = setInterval(async () => {
			const update = await fetchPlantSnapshot(plant.id);
			setSnapshot((prev) => ({ ...prev, ...update }));
		}, 15000); // 15s
		return () => clearInterval(id);
	}, [plant.id]);

	const handleCopyApi = async () => {
		const url = `${window.location.origin}/api/plants/${snapshot.uuid}/moisture`;
		await navigator.clipboard.writeText(url);
	};

	const updatedLabel = snapshot.lastUpdated
		? `Updated ${formatTimeSince(snapshot.lastUpdated)}`
		: "Waiting for first reading";

	const moistureLabel =
		snapshot.moisture == null ? "--" : `${snapshot.moisture}%`;

	return (
		<div className="plant-card" >
			<h2 className="plant-card__title" > {snapshot.name} </h2>
			< p className="plant-card__updated" > {updatedLabel} </p>

			< div className="plant-card__moisture" > {moistureLabel} </div>

			< div className="plant-card__footer" >
				<span className="plant-card__snapshot-label" >
					Latest moisture snapshot
				</span>
				< button className="plant-card__copy-btn" onClick={handleCopyApi} >
					Copy API
				</button>
			</div>
		</div>
	);
};
