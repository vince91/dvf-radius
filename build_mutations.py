import csv
import json
import sys
from collections import defaultdict

# Data fround on https://www.data.gouv.fr/en/datasets/demandes-de-valeurs-foncieres-geolocalisees/

# 1. Read csv

if len(sys.argv) < 2:
    raise ValueError("Missing csv path")

csv_path = sys.argv[1]

with open(csv_path) as f:
    reader = csv.DictReader(f)
    data = list(reader)

print(f"Found {len(data)} rows in the file")

# 2. Group by mutation id

mutations = defaultdict(list)
for row in data:
    mutations[row["id_mutation"]].append(row)

print(f"Found {len(mutations)} unique mutations")

# 3. Filter mutations which have land and house

filtered_mutations = defaultdict(list)
for k, rows in mutations.items():
    has_land = False
    has_house = False
    for row in rows:
        if len(row["surface_terrain"]) > 0:
            has_land = True
        if row["type_local"] == "Maison":
            has_house = True
    if has_land and has_house:
        filtered_mutations[k] = rows

print(f"Found {len(filtered_mutations)} mutations with land and house")

# 4. Build mutation JSON

mutation_objs = []
for mutation in filtered_mutations.values():
    # Filter out mutations with empty financial value
    if mutation[0]["valeur_fonciere"] == "":
        continue

    # Filter out mutations with empty coordinates
    if any(row["latitude"] == "" or row["longitude"] == "" for row in mutation):
        continue

    # Build parcel` map
    parcels = {}
    for row in mutation:
        parcels[row["id_parcelle"]] = [
            row["id_parcelle"],
            float(row["latitude"]),
            float(row["longitude"]),
            [],
            [],
        ]

    # Get unique lands in the mutation
    filtered_lands = [row for row in mutation if len(row["nature_culture"]) > 0 and len(row["surface_terrain"]) > 0]
    uniq_lands = {
        f'{row["code_nature_culture"]}{row["code_nature_culture_speciale"]}{float(row["surface_terrain"])}': row for row
        in filtered_lands
    }.values()

    # Skip mutations without lands
    if len(uniq_lands) == 0:
        continue

    # Get unique buildings in the mutation
    filtered_buildings = [row for row in mutation if len(row["type_local"]) > 0 and len(row["surface_reelle_bati"]) > 0]
    uniq_buildings = {
        f'{row["code_type_local"]}{float(row["surface_reelle_bati"])}': row
        for row in filtered_buildings
    }.values()

    # Skip mutations without buildings
    if len(uniq_buildings) == 0:
        continue

    # Calculate total surface of lands and buildings
    total_lands = sum(float(row["surface_terrain"]) for row in uniq_lands)
    total_buildings = sum(float(row["surface_reelle_bati"]) for row in uniq_buildings)

    # Add lands to the corresponding parcel
    for row in uniq_lands:
        parcel_id = row["id_parcelle"]
        if parcel_id not in parcels:
            raise ValueError(parcel_id)
        parcels[parcel_id][-1].append([
            row["code_nature_culture"],
            float(row["surface_terrain"]),
        ])

    # Add buildings to the corresponding parcel
    for row in uniq_buildings:
        parcel_id = row["id_parcelle"]
        if parcel_id not in parcels:
            raise ValueError(parcel_id)
        parcels[parcel_id][-2].append([
            row["code_type_local"],
            float(row["surface_reelle_bati"]),
        ])

    # Build mutation object
    mutation_obj = [
        mutation[0]["id_mutation"],
        mutation[0]["date_mutation"],
        float(mutation[0]["valeur_fonciere"]),
        total_lands,
        total_buildings,
        list(parcels.values()),
    ]

    mutation_objs.append(mutation_obj)

print(f"Created {len(mutation_objs)} mutation objects")

# Save mutation_objs to json file
with open('mutations.json', 'w') as f:
    json.dump(mutation_objs, f)

print("Saved mutations.json")
