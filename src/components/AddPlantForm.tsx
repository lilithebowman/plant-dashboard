// AddPlantForm.tsx
import React, { useState } from "react";

type Props = {
	onCreate: (data: { name: string; uuid: string }) => Promise<void> | void;
};

export const AddPlantForm: React.FC<Props> = ({ onCreate }) => {
	const [name, setName] = useState("");
	const [uuid, setUuid] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !uuid.trim()) return;
		setLoading(true);
		try {
			await onCreate({ name: name.trim(), uuid: uuid.trim() });
			setName("");
			setUuid("");
		} finally {
			setLoading(false);
		}
	};

	return (
		<form className="add-plant-form" onSubmit={handleSubmit}>
			<h2 className="add-plant-form__title">Create a plant</h2>
			<p className="add-plant-form__subtitle">
				Connect the UUID, and watch its card update as new moisture readings
				come in.
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

				<button
					type="submit"
					className="add-plant-form__submit"
					disabled={loading}
				>
					{loading ? "Adding..." : "Add plant"}
				</button>
			</div>
		</form>
	);
};
