// PlantDashboard.tsx
import React, { useEffect, useState } from "react";
import { Plant } from "../types/plant";
import { fetchPlants, createPlant } from "../services/api";
import { PlantCard } from "./PlantCard";
import { AddPlantForm } from "./AddPlantForm";

export const PlantDashboard: React.FC = () => {
	const [plants, setPlants] = useState<Plant[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const data = await fetchPlants();
				setPlants(data);
				setError(null);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(`Failed to load plants. ${message}`);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const handleCreate = async (data: { name: string; uuid: string }) => {
		try {
			const newPlant = await createPlant(data);
			setPlants((prev) => [newPlant, ...prev]);
			setError(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(`Failed to create plant. ${message}`);
		}
	};

	return (
		<div className="dashboard">
			<header className="dashboard__header">
				<div className="dashboard__brand">CODE PUB</div>
				<h1 className="dashboard__title">Plant Health Dashboard</h1>
			</header>

			<main className="dashboard__main">
				<AddPlantForm onCreate={handleCreate} />
				{error ? <p className="dashboard__error">{error}</p> : null}

				{loading ? (
					<p className="dashboard__loading">Loading plants…</p>
				) : (
					<div className="dashboard__grid">
						{plants.map((plant) => (
							<PlantCard key={plant.id} plant={plant} />
						))}
					</div>
				)}
			</main>
		</div>
	);
};
