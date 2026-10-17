from app.services.ibm_format import parse_patterns, parse_row, to_epoch

HEADER = ("Timestamp,From Bank,Account,To Bank,Account,Amount Received,Receiving Currency,"
          "Amount Paid,Payment Currency,Payment Format,Is Laundering")
ROW = "2022/09/01 00:20,010,8000EBD30,010,8000EBD30,3697.34,US Dollar,3697.34,US Dollar,Reinvestment,0"


def test_to_epoch():
    assert to_epoch("2022/09/01 00:20") == 1661991600


def test_parse_row():
    r = parse_row(ROW.split(","), 7)
    assert r["txn_id"] == "t7"
    assert r["src_bank"] == "010" and r["src_acct"] == "8000EBD30"
    assert r["amount_paid"] == 3697.34 and r["cur_paid"] == "US Dollar"
    assert r["format"] == "Reinvestment" and r["label"] == 0


def test_parse_patterns(tmp_path):
    p = tmp_path / "pat.txt"
    p.write_text(
        "BEGIN LAUNDERING ATTEMPT - FAN-OUT:  Max 16-degree Fan-Out\n"
        "2022/09/01 00:06,021174,800737690,012,80011F990,2848.96,Euro,2848.96,Euro,ACH,1\n"
        "2022/09/01 04:52,021174,800737690,020,80020C5B0,8630.40,Euro,8630.40,Euro,ACH,1\n"
        "END LAUNDERING ATTEMPT - FAN-OUT\n\n"
        "BEGIN LAUNDERING ATTEMPT - CYCLE:  Max 3 hops\n"
        "2022/09/01 01:00,001,A,002,B,10,Euro,10,Euro,Wire,1\n"
        "END LAUNDERING ATTEMPT - CYCLE\n"
    )
    attempts = parse_patterns(p)
    assert [a["pattern"] for a in attempts] == ["FAN-OUT", "CYCLE"]
    assert len(attempts[0]["rows"]) == 2
    assert attempts[0]["accounts"] == sorted({"021174|800737690", "012|80011F990", "020|80020C5B0"})
