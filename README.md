# ark-funds-historical-fund-holdings-and-intraday-trades

This repository contains historical fund holdings and intraday trades of ARK funds. It collects the data from https://ark-funds.com/ three times a day, at UTC 00:00, UTC 03:00 and UTC 12:00.

All the data collected are stored in [data](https://github.com/tsekityam/ark-funds-historical-fund-holdings-and-intraday-trades/tree/main/data) directory. The data are partitioned by date. For each date, there are two set of data, one in the original format downloaded from https://ark-funds.com/ and one in processed CSV format. The processed files remove any invalid lines, such as acknowledgements and empty lines, from the original file and are saved in CSV format. The original files can be found in `/data/{date}/raw`

## Fund holdings

The collection starts at 2021-03-04

### Known issue

- Data of 2021-03-09 is missing

## Intraday trades

The collection starts at 2021-04-01

## Acknowledgements

All the data in this repository are downloaded from https://ark-funds.com/ and none of them is owned by me. Data accuracy is not guaranteed and use the data in your own risk. Please visit https://ark-funds.com/ for the latest data.
