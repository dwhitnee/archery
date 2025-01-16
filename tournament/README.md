# Archery Apps
Copyright (c) 2024 <a href="https://dwhitnee.github.io">David Whitney</a>

## About
Keeps track of archer scores during a local tournament. Cloud based
scoring viewable publically and instantly.

## Archery Tournament Scorekeeper
https://dwhitnee.github.io/archery/tournament

### Quick Start
1. Click "New.." and create a tournament,
2. Click the "gear" icon to see the tournament QR Code.
3. Have one archer on each bale scan the QR Code and click "Add
   Archer" for everyone on the bale. You can drag archers to re-order them.
4. Click "Start Scoring" and tap the archer you want to score.

 - Handles NFAA, Lancaster, and World Archery Indoor/Outdoor formats.
 - Web based, no apps required.
 - No pre-registration, set up your tournament while you are at the bale.

This software is a simple web page where archers can start an
ad-hoc tournament or league easily and quickly. It is NOT designed as
an Event Management solution like Ianseo.

Scoring is done on a phone or tablet for each bale.
The scores are stored in the cloud and can be viewed from any
web browser instantly. There is no requirement for local wifi or a
private LAN.


### Intent and audience
It is aimed at local shoots where one just wants to start a scoring
round with a club or friends, and it does not require huge setup overhead like
most of the scoring apps national organizations use
like BowScore, Eyes on Score, BetweenEnds, or Ianseo.

It is a simple VueJS Javascript webapp with an AWS Dynamo DB
backend for storage.


### Credits
All code written and directed by David Whitney.

Got a feature request or a bug?  Please add an Issue in github.
https://github.com/dwhitnee/archery/issues
