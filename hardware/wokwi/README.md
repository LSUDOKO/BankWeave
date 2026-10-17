# Wokwi card terminal (simulated hardware)

An ESP32 with an SSD1306 OLED, three "card" buttons, a terminal switch and two LEDs. It runs in
the free [Wokwi](https://wokwi.com) simulator; nothing needs to be bought.

## Run it

1. Open <https://wokwi.com/projects/new/esp32>.
2. Replace `sketch.ino` and `diagram.json` with the files here, and add `libraries.txt`
   (Library Manager: Adafruit SSD1306, Adafruit GFX Library, ArduinoJson).
3. Press play. The board joins `Wokwi-GUEST` and the OLED shows `Ready`.
4. Press **Card A**, **Card B**, **Card C** within a minute: three cards on the Mumbai POS
   `POS-MUM-D00063` trigger the `pos_shared_terminal` alert and the red LED.
5. Press the yellow button to switch to the Delhi ATM, then press **Card A**: the cloned card
   replays its counter and arrives 1,148 km away, so `impossible_travel` fires.

Each tap is a `POST /hardware/pos-tap` to the BankWeave API, which builds the ISO 8583
message and its EMV TLV field 55 (printed on the serial monitor; decode it at
<https://emvlab.org/tlvutils/>), writes a `CARD_TXN` edge and a shared `Device` link into the
FalkorDB consortium graph, and raises alerts that the agents triage like any other. The same
taps are available without Wokwi on the Hardware Lab page.

`API_URL` points at the public Render deployment; it may take a minute to wake up.
