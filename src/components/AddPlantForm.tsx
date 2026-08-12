// AddPlantForm.tsx
import React, { useState } from "react";
import { getMoistureEndpoint } from "../services/api";
import { generateUuid } from "../utils/uuid";

type Props = {
	onCreate: (data: {
		name: string;
		uuid: string;
		lowerRawReading: number;
		upperRawReading: number;
	}) => Promise<void> | void;
};

export const AddPlantForm: React.FC<Props> = ({ onCreate }) => {
	const [name, setName] = useState("");
	const [uuid, setUuid] = useState<string>(() => generateUuid());
	const [lowerRawReading, setLowerRawReading] = useState(4095);
	const [upperRawReading, setUpperRawReading] = useState(1500);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !uuid.trim() || lowerRawReading === upperRawReading) return;
		setLoading(true);
		try {
			await onCreate({
				name: name.trim(),
				uuid: uuid.trim(),
				lowerRawReading,
				upperRawReading,
			});
			setName("");
			setUuid(generateUuid());
			setLowerRawReading(4095);
			setUpperRawReading(1500);
		} finally {
			setLoading(false);
		}
	};

	const handleCopyAddPlantApi = async () => {
		if (!uuid.trim()) return;
		await navigator.clipboard.writeText(getMoistureEndpoint(uuid.trim()));
	};

	return (
		<form className="add-plant-form" onSubmit={handleSubmit}>
			<h2 className="add-plant-form__title">Create a plant</h2>
			<p className="add-plant-form__subtitle">
				Create a plant, connect the UUID, and watch its card update as new
				moisture readings come in.
			</p>

			<div className="add-plant-form__row">
				<div className="add-plant-form__field">
					<label>Plant name</label>
					<input
						type="text"
						placeholder="Lil's Flailing Green Goblin"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="add-plant-form__field">
					<label>Plant UUID</label>
					<input
						type="text"
						placeholder="e.g. 7f2c1c3a-..."
						value={uuid}
						onChange={(e) => setUuid(e.target.value)}
					/>
				</div>

				<div className="add-plant-form__field">
					<label>Lower raw reading (0%)</label>
					<input
						type="number"
						min={0}
						max={4095}
						value={lowerRawReading}
						onChange={(e) => setLowerRawReading(Math.max(0, Math.min(4095, Number(e.target.value) || 0)))}
					/>
				</div>

				<div className="add-plant-form__field">
					<label>Upper raw reading (100%)</label>
					<input
						type="number"
						min={0}
						max={4095}
						value={upperRawReading}
						onChange={(e) => setUpperRawReading(Math.max(0, Math.min(4095, Number(e.target.value) || 0)))}
					/>
				</div>

				<button
					type="submit"
					className="add-plant-form__submit"
					disabled={loading || lowerRawReading === upperRawReading}
				>
					{loading ? "Adding..." : "Add plant"}
				</button>

				<button
					type="button"
					className="add-plant-form__api-btn"
					onClick={handleCopyAddPlantApi}
					disabled={!uuid.trim()}
				>
					Add plant API
				</button>
			</div>
		</form>
	);
};
