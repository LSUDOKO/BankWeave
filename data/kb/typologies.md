<!-- Summaries written by the BankWeave team in our own words. Sources are linked, not copied. -->

## fan-out | Fan-out distribution (smurfing outward)
Sources: https://www.fatf-gafi.org/en/publications/Methodsandtrends.html ; IBM AMLworld paper https://arxiv.org/abs/2306.16424
One account sends many transfers to many different counterparties in a short window, often in
similar amounts below a reporting threshold. Indicators: sudden outward burst; counterparties
with little other history; amounts clustered just under thresholds.

## fan-in | Fan-in collection (funnel account)
Sources: https://www.fincen.gov/resources/advisories ; IBM AMLworld paper https://arxiv.org/abs/2306.16424
Many accounts send money into one account within a short window. The receiving account often
moves the pooled funds onward soon after. Indicators: many unrelated payers; pooled balance
leaves quickly; payers spread across institutions.

## cycle | Circular flow (round-tripping)
Sources: https://www.fatf-gafi.org/en/publications/Methodsandtrends.html ; IBM AMLworld paper https://arxiv.org/abs/2306.16424
Funds travel through a chain of accounts and return to where they started, usually in time
order and with a small fee taken at each hop. It disguises the origin of money and can fake
business turnover. Indicators: time-ordered loop; near-equal amounts at each hop.

## scatter-gather | Scatter-gather layering
Sources: IBM AMLworld paper https://arxiv.org/abs/2306.16424
A source splits funds across several intermediaries, each of which forwards nearly the same
amount to one common destination. Indicators: parallel two-hop paths with matching amounts.

## gather-scatter | Gather-scatter
Sources: IBM AMLworld paper https://arxiv.org/abs/2306.16424
Funds from several payers pool in one hub account which then redistributes to several payees.
Indicators: fan-in followed by fan-out at the same account within hours.

## stack | Stacked layering
Sources: IBM AMLworld paper https://arxiv.org/abs/2306.16424
Several layers of accounts where each layer pays every account in the next layer, adding
distance between source and destination. Indicators: layered bipartite structure; short gaps.

## bipartite | Bipartite transfer pattern
Sources: IBM AMLworld paper https://arxiv.org/abs/2306.16424
Two groups of accounts exchange money only across the groups. Indicators: dense cross-group
transfers with no transfers inside each group.

## structuring | Structuring below reporting thresholds
Sources: https://www.fincen.gov/resources/statutes-regulations/guidance ; https://bsaaml.ffiec.gov/manual
Splitting amounts so each transfer stays under a reporting threshold (for example just under
10,000). Indicators: repeated amounts at 85-99% of the threshold; several in a short period.

## pass-through | Pass-through / mule relay
Sources: https://www.fincen.gov/resources/advisories ; arXiv 2609.20737
An account receives money and sends almost the same amount onward shortly after, keeping
little. Typical of money mules. Indicators: matched in/out pairs, high similarity, short gap.

## shared-identity | Shared devices or addresses across unrelated customers
Sources: https://www.fatf-gafi.org/en/publications/Methodsandtrends.html
Accounts that claim to be unrelated share a device, IP address or residential address.
Strong when few accounts share it; weak when the attribute is common (a large apartment
building or office network).
