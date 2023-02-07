# DKV2 import script

Import data from a CSV file to [DKV2](https://github.com/Schachigel/DKV2/).

I wrote this script to move data from an excel file into DKV2. The script has to be adjusted for other source files and fieldnames. It is not meant to be generic. If you have Direktkredit data in a spreadsheet, you can use this script as a base. Likely you will have to adjust only the `parseRow` function to replace field names and possibly some of the `parse` functions for individual fields.

Usage is:
```
# git clone this repo
npm install
node bin.js -b <base.dkdb> -i <input.csv> -o <out.dkdb>
```
where `base.dkdb` is a path to a DKV2 database file (created with DKV2), `input.csv` is CSV file (first row headers, then data rows), and `out.dkdb` is the file path where the resulting DKV2 database is written to.

Then, open `out.dkdb` with DKV2 and check the results.
