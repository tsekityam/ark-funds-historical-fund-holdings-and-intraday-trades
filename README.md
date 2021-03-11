# ARK-Invest-ETFs-Historical-Holdings

### Known issue

- Data of 2021-03-09 is missing because ARK blocked curl requests without user agent.
  In order to resolve the issue, the following changes are made
  1. Increase download frequency to twice a day (at UTC 0000 and UTC 1200)
  2. Add user agent to curl request
