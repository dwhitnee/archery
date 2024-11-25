# Archery Apps
Copyright (c) 2024 <a href="http://dwhitnee.s3-website-us-east-1.amazonaws.com/">David Whitney</a>

## About
Keeps track of archer scores during a tournament. Cloud based scoring.

## Tournament Scorekeeper
https://dwhitnee.github.io/archer/tournament

Handles NFAA, Lancaster, and Indoor and Outdoor World Archery formats.

This software is designed as a webapp where archers can start an
ad-hoc tournament or league easily and quickly.

Scoring is done on a phone or tablet for each bale.
The scores are stored in the cloud and can be viewed from any
web browser instantly. There is no requirement for local wifi or a
private LAN.

It is aimed at local shoots where one just wants to start a scoring
round with a club or friends, and it does not require huge setup overhead like
most of the more popular scoring apps that national organizations use.

It is a simple VueJS Javascript webapp with an AWS Dynamo DB
backend for storage.

Create a tournament, then have one archer on each bale scan the QR
Code and start scoring. That's it.


## Credits
All code written and directed by David Whitney.

Got a feature request or a bug?  Please add an Issue in github.
https://github.com/dwhitnee/archery/issues
