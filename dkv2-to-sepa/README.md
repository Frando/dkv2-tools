# CSV to SEPA

Create a SEPA batch wire transfer XML file ("Sammelüberweisung") from a CSV emitted by DKV2. You can import the resulting XML file in your online banking to issue a batch (mass) transfer in one go.

## Installation

```
pip install sepaxml toml
```

## Usage

```
./dkv2-to-sepa.py
usage: dkv2-to-sepa [-h] [-c CONFIG] input [output]
```

## Detailed instructions

* Create the yearly interest report (*Jahreszinsabrechnung*) in DKV2
* Install `python` and `pip` (e.g on Ubuntu/Debian: `apt install python3-pip`)
* Install the required pip packages:
  ```
  pip install sepaxml toml
  ```
* Copy the file [`config.example.py`](config.example.py) to `config.py`, open it in a text editor, and adjust all entries. See the comment in the file for details.
* Open a terminal and navigate to this folder. Then, run this command:
  ```
  ./dkv2-to-sepa.py path/to/Jahreszinsabrechnung-20XX.csv
  ```
* The program will print detailed logs. Read them to check for errors.
* You will get a file `SEPATransfer-XXXXX-Jahreszinsabrechung-20XX.xml`. Import this in your online banking (usually called "Sammelauftrag" or "SEPA Sammler" or similar)


