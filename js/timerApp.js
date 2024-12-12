/*global fetch, Vue, VueRouter, Util */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2023, David Whitney
//  This file is part of Tournament Archery Timer

// Archery Timer is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//-----------------------------------------------------------------------

//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 event-driven webapp to control archery lines in a tournament.
//
//  This app is a state machine managing the below events. A timer
//  ticks every second and updates the app's state until the end is
//  over.
//
//  The screen is RED when it is unsafe to shoot, GREEN when it's OK to shot,
//  and YELLOW when you are almost out of time.
//
//  An archery round consists of a number of ends shot by any number
//  of archers on a shooting line. Sometimes there are too many archers to fit
//  so multiple lines are used sequentially.
//
//  There is a warning period to start each end so archers can
//  position themselves on the shooting line. Two horns are sounded to
//  start this period, one horn is sounded when it's time to start
//  shooting.  If there are multiple lines of archers, an additional
//  two horns are sounded to alert the next group of archers to move up
//  to the line, followed again by a single horn to shoot.

//  When an end is done, three horns are sounded indicating all clear
//  and the timer stops.  An operator must hit the button or the space
//  bar to start the next end.  The button can be hit at any time to
//  prematurely end the current line and move to the next state (next line or end finished).

//  The type of round can be configured (2:00 ends for indoor, 4:00
//  for outdoor), and these prefs are saved to LocalStorage
//  ----------------------------------------------------------------------


// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [ ]
});

let app = new Vue({
  router,
  el: '#archeryTimerApp',

  //----------------------------------------
  // Game Model (drives the View, update these values only
  //----------------------------------------
  data: {
    message: "",

    // state machine for where we are in a Round
    endNumber: 1,
    lineUp: 1,
    timeLeft: 0,
    rangeIsHot: false,
    lineName: [0, "ab", "cd", "ef"],
    red: "red",
    green: "green",
    yellow: "yellow",
    inDistractionMode: false,  // whether to play noises randomly

    // match play state
    isMatch: false,
    isLeftUp: true,

    // match prefs
    // a match consists of two archers alternating one at a time. The horn sounds after
    // an arrow is shot, indicating it is the other archer's turn.
    match: {
      leftFirst: true,    // shooter order (swappable)
      // maxEnds: 3,       // per archer
      // prepTime: 10,
      // endDuration: 30
    },

    // round prefs (saved to cookies)
    round: {
      practiceEnds: 2,
      maxEnds: 10,   // 10 indoor, 12 outdoor
      endDuration: 120,  // 120 indoor 240 outdoor
      endPrepTime: 10,
      numLines: 2,   // AB/CD or AB
      bottomLineUpFirst: true,    // NFAA: bottom line up first, WA: top line
    },

    defaultRounds: {
      indoorWA: {
        practiceEnds: 2,
        maxEnds: 10,
        endDuration: 120,
        endPrepTime: 10,
        numLines: 2,   // AB/CD or AB
        alternateLines: true
      },
      outdoorWA: {
        practiceEnds: 2,
        maxEnds: 12,
        endDuration: 240,
        endPrepTime: 10,
        numLines: 2,   // AB/CD or AB
        alternateLines: true
      },
      matchWA: {
        practiceEnds: 0,
        maxEnds: 6,
        endDuration: 30,
        endPrepTime: 10,
        numLines: 6,   // treat each arrow as a "line" since clock is reset
        alternateLines: false
      },

    },

    showCredits: false,
    version: "0.2"
  },

  //----------------------------------------
  // derived attributes, mostly conveniences to pull out of server
  // state for easier rendering
  //----------------------------------------
  computed: {
    // for feedback, this gets cached in DOM when <a> tag built
    deviceData() {
          let CRLF = "%0D%0A";
          return CRLF + "----" + CRLF +
            "build: " + this.version + CRLF +
            "Resolution: " + window.screen.availWidth + "x" +
            window.screen.availHeight + CRLF +
            "Viewport: " + window.innerWidth + "x" + window.innerHeight + CRLF +
            "UserAgent: " + navigator.userAgent + CRLF +
            "";
    },
  },

  //----------------------------------------
  // display format
  //----------------------------------------
  filters: {
    minSecondsFormat: function( inSeconds ) {
      let seconds = inSeconds % 60;
      seconds = seconds < 10 ? "0"+seconds : seconds;
      return Math.floor( inSeconds/60 ) + ":" + seconds;
    }
  },

  //----------------------------------------
  // We spin until game loaded so this can be anywhere in lifecycle
  //----------------------------------------
  mounted() {
    // handle broken promises.
    window.addEventListener('unhandledrejection', function(event) {
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    Util.setNamespace("Timer");

    // TODO: potential future use for hard coded URL to indoor or outdoor round
    this.roundType = this.$route.query.round;

    this.updateTimer();

    this.round = Util.loadData("round") || this.round;
    this.isMatch = Util.loadData("isMatch") || false;

    // cycle through ends with arrow keys
    let left = 37, right = 39;
    this.navigateEnds = (event) => {
      if (event.keyCode === left) {
        console.log("left");
        if (this.endNumber > 1) {
          this.endNumber--;
        }
      }
      if (event.keyCode === right) {
        console.log("right");
        this.endNumber++;
      }
    };
    document.body.addEventListener("keydown", this.navigateEnds );
    // this.goFullScreen();  // fails? Needs to be an interactive function
  },

  // synchronous app setup before event handling starts
  beforeCreate: function() {
  },

  //----------------------------------------------------------------------
  // event handlers and other things that should not be computed
  // functions are accessible from the web page
  //----------------------------------------------------------------------
  methods: {
    // set the message to display lcoally, keep it for 2-3 cycles (6 seconds)
    // (otherwise local messages disappear too fast)
    setMessage: function( message, pause ) {
      this.message = message;
      pause = pause || 0;
      this.messageCountdown = pause + 1;
    },

    //----------------------------------------
    // P1, P2, 1, 2, 3...
    //----------------------------------------
    endDisplay: function() {
      let end = this.endNumber;
      if (end <= this.round.practiceEnds) {
        return "Practice " + end;
      } else {
        return this.endNumber - this.round.practiceEnds;
      }
    },


    // don't alternate if only one line
    doAlternateLines: function() {
      if (this.round.numLines == 1) {
        return false;
      } else {
        return this.round.alternateLines;
      }
    },

    //----------------------------------------
    // @return true if given line number is currently up
    // For WA rounds, each end alternates who is first
    // For NFAA rounds, the order stays the same
    //----------------------------------------
    isLineUp( lineNum ) {
      let swapOrder = this.doAlternateLines() && !(this.endNumber % 2);

      if (this.lineUp == lineNum) {
        return !swapOrder;
      } else {
        return swapOrder;
      }
    },

    //----------------------------------------
    // "AB" or "ab" - capitalize current line
    // Alternate AB/CD up first for WA Rounds
    //----------------------------------------
    displayLine: function( line ) {
      let str = this.lineName[line] || "";

      if (this.isLineUp( line )) {
        str = str.toUpperCase();
      }

      return str;
    },

    //----------------------------------------
    // "AB" "CD" "EF"?
    // Alternate AB/CD up first for WA Rounds
    //----------------------------------------
    displayAllLines: function() {
      let lineNames = [0, "ab", "cd", "ef"];

      // switch for even rounds
      let swapOrder = this.doAlternateLines() && !(this.endNumber % 2);

      let str = "";
      for (let i=1; i <= this.round.numLines; i++) {
        if (swapOrder) {
          if (i != this.lineUp) {
            str += lineNames[i].toUpperCase();
          } else {
            str += lineNames[i];
          }
        } else {
          if (i == this.lineUp) {
            str += lineNames[i].toUpperCase();
          } else {
            str += lineNames[i];
          }
        }

      }
      return str;
    },

    isTimerRunning: function() {
      return this.ticker;
    },

    //----------------------------------------
    // Kick off an end
    //----------------------------------------
    startTimer: function() {
      if (this.ticker) return;

      this.goFullScreen();
      this.updateRoundPrefs( this.round );  // FIXME: should only call this on dialog close

      console.log("Archers to the line");
      let now = Math.floor(Date.now() / 1000);

      let prep = this.round.endPrepTime;
      if (this.isMatch && !this.isLineUp(1) ) {
        prep = 0;   // no gap between archers in a match
      }

      this.timerEndSeconds = now + this.round.endDuration + prep;

      if (this.isMatch && !this.isLineUp( 1 )) {
        this.setMessage("");
      } else {
        this.playPrepHorn();  // Add 1 second for horn
        this.setMessage("ARCHERS TO THE LINE");
      }

      // every second recalcuate time left, should trigger display
      this.ticker = setInterval(() => { this.updateTimer(); }, 1000);
      this.updateTimer();  // prime the pump
    },

    //----------------------------------------
    // called by ticker so display can be updated
    // If clock is running, check for state changes
    // If clock is not running, just show
    //----------------------------------------
    updateTimer: function() {

      if (!this.isTimerRunning()) {

        this.timeLeft = this.round.endPrepTime;
        this.rangeIsHot = false;

      } else {  // clock is running, what should happen next?

        if (this.inDistractionMode) {
          this.distract();
        }

        // clock is running, update state if necessary
        let now = Math.floor(Date.now() / 1000);
        this.timeLeft = this.timerEndSeconds - now;

        // If during prep time, just show time until you can shoot
        if (this.timeLeft > this.round.endDuration) {
          this.timeLeft = this.timeLeft - this.round.endDuration;
          this.rangeIsHot = false;

        } else {   // it's shooting time
          if (!this.rangeIsHot) {
            this.rangeIsHot = true;
            this.playStartHorn();
            this.setMessage("");
          }
        }

        if (this.timeLeft <= 0 && this.rangeIsHot) {       // line is done, move on or wait?
          this.rangeIsHot = false;
          this.lineIsDone();
        }
        // console.log("time left: " + this.timeLeft);
      }
    },

    //----------------------------------------
    // Retrieve <audio> tag and play it (make sure any other sounds are stopped first)
    //----------------------------------------
    playHorn: function( times ) {
      let horn = document.getElementById('horn');

      horn.pause();  // stop any previous noise
      horn.currentTime = 0;

      horn.play();

      if (times > 1) {
        setTimeout( () => { this.playHorn( times-1 ); }, 1000 );
      }
    },

    playPrepHorn: function() {
      this.playHorn( 2 );
    },
    playStartHorn: function() {
      this.playHorn( 1 );
    },
    playEndHorn: function() {
      this.playHorn( 3 );
    },
    playDangerHorn: function() {
      this.playHorn( 5 );
    },

    // [0, n)
    random: function( max ) { return Math.floor(max * Math.random());  },

    //----------------------------------------
    // A 1 in 100 chance of playing a distracting sound
    //----------------------------------------
    distract: function() {
      if (this.random(100) < 3) {
        console.log("BOO!");
        let distraction = document.getElementById('distraction');

        distraction.pause();  // stop any previous noise
        distraction.currentTime = 0;
        distraction.play();
      }
    },

    //----------------------------------------
    // Skip to next state - either this line is done (perhaps prematurely),
    //  or we're starting a new line
    //----------------------------------------
    proceed: function() {
      if (!this.isTimerRunning()) {
        this.startTimer();
      } else {    // skip to end
        this.lineIsDone();
      }
    },

    //----------------------------------------
    // Advance the clock to zero
    // Sound horn, move to next state (end over, next line/archer up)
    // In match play, move to next archer. (ie, treat each shot as a line shooting an end)
    //----------------------------------------
    lineIsDone: function() {

      this.rangeIsHot = false;
      this.timeLeft = 0;
      this.timerEndSeconds = 0;
      clearInterval( this.ticker );
      this.ticker = 0;

      if (this.isMatch) {
        this.isLeftUp = !this.isLeftUp;  // swap archers
      }

      // start next line/archer if necessary
      if (this.lineUp < this.round.numLines) {
        this.lineUp++;
        this.startTimer();

      } else {
        this.endIsDone();
      }
    },

    //----------------------------------------
    // End is complete, time to go score and get ready for the next end
    //----------------------------------------
    endIsDone: function() {
      console.log("End is done, go score");
      this.playEndHorn();
      this.lineUp = 1;
      this.endNumber++;
    },

    //----------------------------------------
    // Screen CSS
    // Red, then green, then yellow
    //----------------------------------------
    timerBackgroundClass: function( isLeft ) {

      if (this.isMatch && this.rangeIsHot) {
        if (isLeft) {
          return this.isLeftUp? this.green : this.red;
        } else {
          return !this.isLeftUp? this.green : this.red;
        }
      }

      if (!this.rangeIsHot) {
        return this.red;
      } else if ((this.timeLeft < 30) && !this.isMatch) {   // For a match, skip the yellow
        return this.yellow;
      } else {
        return this.green;
      }
    },

    // quick fill for settings.
    populateIndoorDefaults: function() {
      this.round = this.defaultRounds.indoorWA;
    },
    populateOutdoorDefaults: function() {
      this.round = this.defaultRounds.outdoorWA;
    },
    populateMatchDefaults: function() {
      this.isMatch = !this.isMatch;
      if (this.isMatch) {
        this.round = this.defaultRounds.matchWA;
      } else {
        this.round = Util.loadData("round") || this.round;
        // reset to last saved values, 6 lines is crazy
      }
      if (this.isMatch) {
        this.setMessage("MATCH PLAY");
      }

    },

    //----------------------------------------------------------------------
    // update stats for person who picked trump suit, and defending team
    // called after every hand is done? Or just at end of game...FIXME
    //----------------------------------------------------------------------
    updateRoundPrefs: function( round ) {
      // let oldRound = Util.loadData("round") || {};
      Util.saveData("round", round );
      Util.saveData("isMatch", this.isMatch);
    },


    //----------------------------------------
    // Dialog handlers
    //----------------------------------------
    openDialog( name, openCallback ) {
      this.openDialogElement( document.getElementById( name ));
      if (openCallback)
        openCallback();
    },
    // @input button click that caused the close (ie, button),
    //    assumes it's the immediate child of the dialog
    closeDialog( event ) {
      this.closeDialogElement( event.target.parentElement );
    },
    // @input dialog element itself
    openDialogElement( dialog ) {
      if (this.dialogIsOpen) {  // can't open two dialogs at once
        return;
      }
      // grey out game
      document.getElementById("dialogBackdrop").classList.add("backdropObscured");
      this.dialogIsOpen = true;  // flag to disable other dialogs. Vue doesn't respect this on change(in v-if)?

      dialog.open = true;           // Chrome
      dialog.style.display="flex";  // Firefox/Safari

      this.addDialogDismissHandlers( dialog );  // outside click and ESC
    },

    //----------------------------------------------------------------------
    // close dialog, restore background, remove event handlers.
    // @input dialog element itself
    //----------------------------------------------------------------------
    closeDialogElement( dialog ) {
      document.getElementById("dialogBackdrop").classList.remove("backdropObscured");

      this.dialogIsOpen = false;  // FIXME: Vue is not seeing this; Do we just need to add it to the data() section?
      dialog.open = false;
      dialog.style.display="none";

      // dialog gone, stop listening for dismiss events
      let backdrop = document.getElementById("dialogBackdrop");
      backdrop.removeEventListener('click', this.closeDialogOnOutsideClick );
      document.body.removeEventListener("keydown", this.closeDialogOnESC );
    },

    //----------------------------------------------------------------------
    // Close on click outside dialog or ESC key.
    // Save functions for removal after close()
    //----------------------------------------------------------------------
    addDialogDismissHandlers( dialog ) {
      // FIXME, these event handlers happen after Vue event
      // handlers so you can play the game while a dialog is
      // open.  How to disable all of game wile dialog is open?

      this.closeDialogOnOutsideClick = (event) => {
        const clickWithinDialog = event.composedPath().includes( dialog );
        if (!clickWithinDialog) {
          this.closeDialogElement( dialog );
        }
      };
      this.closeDialogOnESC = (event) => {
        if (event.keyCode === 27) {
          this.closeDialogElement( dialog );
        }
      };

      // Could also use dialog::backdrop, but it is not fully supported
      // Fake our own backdrop element to swallow clicks and grey out screen
      // by not using "body" we don't need to worry about click bubbling
      let backdrop = document.getElementById("dialogBackdrop");
      backdrop.addEventListener('click', this.closeDialogOnOutsideClick );
      document.body.addEventListener("keydown", this.closeDialogOnESC );
    },

    //----------------------------------------
    goFullScreen: function() {
      try {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        }
      } catch (e) {
        console.error("doh! " + e );
        return;
      }
      // } else if (document.exitFullscreen) {
      //   document.exitFullscreen();

    }

  }
});
