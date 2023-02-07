#!/usr/bin/env python

from sepaxml import SepaTransfer
import toml
import datetime
import csv
import sys
import argparse
from os import path

parser = argparse.ArgumentParser(
    prog = 'dkv2-to-sepa',
    description = 'Convert DKV2 interest report CXV to SEPA wire transfer XML',
    )
parser.add_argument('input', help = "Path to CSV file of DKV yearly interest report")
parser.add_argument('output', nargs = "?", help = "Output filepath (default: generated filename in current folder)")
parser.add_argument('-c', '--config', default = "./config.toml", help = "path to config file")
args = parser.parse_args()

config = toml.load(args.config)
print(config)
print(f"Loaded config from {args.config}")
input_basename = path.splitext(path.basename(args.input))[0] 
output_filename = args.output or "SEPATransfer-" + input_basename + ".xml"
print(f"Will write output to {output_filename}")
skipped_filename = "SEPATransfer-SKIPPED-" + input_basename + ".csv"

sepa_config = {
    "name": config["name"],
    "IBAN": config["IBAN"],
    "BIC": config["BIC"],
    "currency": "EUR",
    "batch": True
}

transactions = []
skipped = []

with open(args.input, newline="") as csvfile:
    reader = csv.DictReader(csvfile, skipinitialspace=True, delimiter=";")
    for row in reader:
        if row["Auszahlend"] != "auszahlend":
            continue

        amount = row["Zins"]
        amount = float(amount.replace(",", "."))
        amount = round(amount * 100, 0)
        amount = int(amount)

        # The DKV2 CSV contains three weird bytes before the V in Vorname
        # They arrive in python as \ufeff
        # TODO: File issue in DKV2 to fix this weirdness
        first_name = row.get("Vorname", row.get("\ufeffVorname", ""))
        if first_name != "":
            first_name += " "
        name = first_name + row["Nachname"]
        details = config["details_prefix"] + " " + row["Kennung"] + " " + name
        data = {
            "iban": row["IBAN"],
            "amount": amount,
            "name": name,
            "details": details
        }

        if not data["iban"]:
            print("SKIPPING " + data["name"] + ": NO IBAN")
            skipped.append(data)
            continue

        if data["name"] in config["skip_names"]:
            print("SKIPPING " + data["name"] + ": Custom skiplist")
            skipped.append(data)
            continue

        transactions.append(data)


sepa = SepaTransfer(sepa_config, clean=True)
i = 0
total_amount = 0
print("Creating SEPA xml with these entries:")
for data in transactions:
    i += 1
    print("  ", i, data["name"], data["iban"], data["amount"] / 100, "EUR")
    payment = {
        "name": data["name"],
        "IBAN": data["iban"],
        "amount": data["amount"],  # in cents
        "execution_date": datetime.date.today() + datetime.timedelta(days=1),
        "description": data["details"]
        # "endtoend_id": str(uuid.uuid1())  # optional
    }
    total_amount += data["amount"]
    sepa.add_payment(payment)

output = sepa.export(validate=True, pretty_print=True)
f = open(output_filename, "wb")
f.write(output)
print(f"wrote {output_filename}")
print(f"total amount: {total_amount / 100}")


if len(skipped):
    with open(skipped_filename, "w", newline="") as csvfile:
        skipped_amount = 0
        fieldnames = ["name", "iban", "amount", "details"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for data in skipped:
            skipped_amount += data["amount"]
            data["amount"] = data["amount"] / 100
            writer.writerow(data)

        print(f"wrote {len(skipped)} skipped entries to {skipped_filename}")
        print(f"skipped amount: {skipped_amount / 100}")
        print(f"total amount including skipped: {(skipped_amount + total_amount) / 100}")
