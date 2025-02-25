# Instant Archery Tournament Scorekeeper
Copyright (c) 2024-2025 <a href="https://dwhitnee.github.io">David Whitney</a> 
(<a href="mailto:dwhitnee@gmail.com">Email</a>)

[dwhitee.github.io/archery/tournament](https://dwhitnee.github.io/archery/tournament)

## About
Start digital scoring for a local tournament or league in less than 60 seconds.

Keeps track of archer scores. Cloud based scoring viewable publically and instantly.
This software is a simple web page where any group of archers can start an
ad-hoc tournament or league easily and quickly. It is NOT designed as
an Event Management solution like Ianseo/BetweenEnds, though it should look
familiar if you have used such apps.

### Quick Start
1. Click "New.." and create a tournament,
2. Click the "gear" icon to see the tournament QR Code.
3. Have one archer on each bale be the scorer. They should scan the QR Code and click "Add
   Archer" for everyone on the bale.
   - You can drag archers to re-order them or tap/click an archer to edit.
4. Click "Start Scoring" and tap the archer you want to score.
5. Need an end timer? Try [this one](https://dwhitnee.github.io/archery/timer/)

If you just want to try it out, please use the "Sandbox" venue as your
location. Tournaments in the sandbox will be deleted periodically so
pick a real venue if you want your tournament or league to hand around.

### Create a League
A league is just a collection of tournaments.
1. Create a league by clicking "New..." and specify how many scoring rounds to include. You can
optionally drop one score from the totals. The overview page will show
running totals for all archers who have participated in any tournament
in the league. Note that you must use the same name (exactly) for each
tournament round in the league.
2. Click "New..." again to create a tournament in the league and
   proceed as above.

### Features
 - Handles NFAA, Lancaster, and World Archery Indoor/Outdoor formats.
 - Web based, no apps required.
 - No pre-registration, set up your tournament while you are at the bale.
 - Live results ([example](https://dwhitnee.github.io/archery/tournament/overview/?leagueId=5))
 - click scores to see full scorecard.
 - NB: Does not handle user accounts, security, payments, or pre-arranged events (yet?).

Scoring is done on a phone or tablet for each bale.
The scores are stored in the cloud and can be viewed from any
web browser instantly. There is no requirement for local wifi or a
private LAN.


### Intent and audience
This is aimed at local shoots where one just wants to start a scoring
round with a club or friends, and it does not require huge setup overhead like
most of the scoring apps national organizations use
like BowScore, Eyes on Score, BetweenEnds, or Ianseo.

It is a simple VueJS Javascript webapp with an AWS Dynamo DB
backend for storage.


### Credits
All code written and directed by David Whitney.

Stress testing by the crowd at the Nock Point and Next Step Archery in Seattle

Got a feature request or a bug?  Please add an Issue in github.
https://github.com/dwhitnee/archery/issues
