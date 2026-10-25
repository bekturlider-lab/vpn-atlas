# Free geolocation data

The optional automatic downloader obtains **DB-IP IP to Country Lite**, provided
by DB-IP.com, under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

- Source and release details: https://db-ip.com/db/download/ip-to-country-lite
- License: https://creativecommons.org/licenses/by/4.0/
- Attribution: [IP Geolocation by DB-IP](https://db-ip.com)

The downloader decompresses the MMDB archive without modifying its geolocation data.
The server derives allow/deny decisions from country codes. The download is public
and requires no account or API key. No visitor addresses are sent to DB-IP; lookups
run locally. Database files and download metadata are excluded from Git and source
archives. The Lite database has reduced coverage and accuracy and is updated monthly.

Retain the attribution link on the main page and error page if you use this data.
The Country database does not contain city or regional records. To apply actual
regional rules, supply a compatible City database separately and set
GEOIP_AUTO_DOWNLOAD=false. Browser simulator regions remain illustrative.

The UI uses the Manrope font, distributed under the SIL Open Font License.
Its license is included in public/assets/OFL-Manrope.txt.
