# Archery Timer
Copyright (c) 2023 <a href="http://dwhitnee.s3-website-us-east-1.amazonaws.com/">David Whitney</a>

## Use it!
https://dwhitnee.github.io/archeryTimer

## About
This is a simple Timer used for Archery Tournaments.

Handles Indoor and Outdoor World Archery formats with variable end length.
By default this is two minutes indoor and four minutes outdoor with a 10 second prep time.

No App Store, just HTML elements and CSS. This should work well on
any browser, OS, phone, iPad, laptop, or tablet. If you find an issue please
let me know the device in the feedback section of the app.

Inspired by the myriad iOS, Android, and Windows timer apps that are
all wonderful but seem to always fall just short and require different tweaks to make work.

## More info

This app is a state machine managing the below events. A timer ticks
every second and updates the app's state until the end is over.

The screen is RED when it is unsafe to shoot, GREEN when it's OK to
shot, and YELLOW when you are almost out of time.

An archery round consists of a number of ends shot by any number of
 archers on a shooting line. Sometimes there are too many archers to
 fit so multiple lines are used sequentially.

 There is a warning period to start each end so archers can
 position themselves on the shooting line. Two horns are sounded to
 start this period, one horn is sounded when it's time to start
 shooting.  If there are multiple lines of archers, an additional
 two horns are sounded to alert the next group of archers to move up
 to the line, followed again by a single horn to shoot.

 When an end is done, three horns are sounded indicating all clear
 and the timer stops.  An operator must hit the button or the space
 bar to start the next end.  The button can be hit at any time to
 prematurely end the current line and move to the next state (next line or end finished).

 The type of round can be configured (2:00 ends for indoor, 4:00
 for outdoor), and these prefs are saved to LocalStorage

## Run locally
http://localhost/archeryTimer/

## Credits
All code written and directed by David Whitney.

Got a feature request or a bug?  Please add an Issue in github.
https://github.com/dwhitnee/archeryTimer/issues
