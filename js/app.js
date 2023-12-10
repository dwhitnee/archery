/*global fetch, Vue, VueRouter, Util */
//-----------------------------------------------------------------------
//  Copyright 2023, David Whitney
// This file is part of Tournament Archery Timer

// Archery Timer is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//-----------------------------------------------------------------------

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
    // state machine for where we are in a Round
    endNumber: 1,
    lineUp: 1,
    timeLeft: 0,
    rangeIsHot: false,

    red: "red",
    green: "green",
    yellow: "yellow",

    round: {  // round prefs
      practiceEnds: 2,
      maxEnds: 10,   // 10 indoor, 12 outdoor
      endDuration: 120,  // 120 indoor 240 outdoor
      endPrepTime: 10,
      numLines: 2,   // AB/CD or AB
      bottomLineUpFirst: true,    // NFAA: bottom line up first, WA: top line
    },

    prefs: { // display prefs
      cardScale: 100,      // TODO: persist this value to settings, what event?
    },

    showCredits: false,
    version: "0.1"
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
      alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    this.roundType = this.$route.query.round;

    this.updateTimer();

    this.prefs = Util.loadData("prefs") || this.prefs;

    // this.goFullScreen();  // fails?
  },

  // synchronous app setup before event handling starts
  beforeCreate: function() {
  },

  //----------------------------------------------------------------------
  // event handlers and other things that should not be computed
  //fns accessible from the web page
  //----------------------------------------------------------------------
  methods: {

    // TODO:
    // skip forward and backward through end numbers
    // skip button with spacebar
    // mobile formatting (full screen portrait and landscape)


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
    //----------------------------------------
    // "AB" "CD" "EF"?
    //----------------------------------------
    lineDisplay: function() {
      let lineNames = [0, "ab", "cd", "ef"];
      let str = "";
      for (let i=1; i <= this.round.numLines; i++) {
        if (i == this.lineUp) {
          str += lineNames[i].toUpperCase();
        } else {
          str += lineNames[i];
        }
      }
      return str;
    },

    isTimerRunning: function() {
      return this.ticker;
    },

    startTimer: function() {
      if (this.ticker) return;

      this.goFullScreen();

      console.log("Archers to the line");
      let now = Math.floor(Date.now() / 1000);
      this.timerEndSeconds = now + this.round.endDuration + this.round.endPrepTime + 1;
      this.playPrepHorn();  // Add 1 second for horn

      // every second recalcuate time left, should trigger display
      this.ticker = setInterval(() => { this.updateTimer(); }, 1000);
    },

    //----------------------------------------
    // called by ticker so display can be updated
    // If clock is running, check for state changes
    // If clock is not running, just show
    //----------------------------------------
    updateTimer: function() {

      if (!this.timerEndSeconds) {
        // clock is not running

        this.timeLeft = this.round.endPrepTime;
        this.rangeIsHot = false;

      } else {
        // clock is running, update state if necessary
        let now = Math.floor(Date.now() / 1000);
        this.timeLeft = this.timerEndSeconds - now;

        // If during prep time, just show time until you can shoot
        if (this.timeLeft > this.round.endDuration) {
          this.timeLeft = this.timeLeft - this.round.endDuration;
          this.rangeIsHot = false;

        } else {   // it's shooting time
          if (!this.rangeIsHot) {
            this.playStartHorn();
            this.rangeIsHot = true;
          }
        }

        if (this.timeLeft <= 0 && this.rangeIsHot) {       // line is done, move on or wait?
          this.rangeIsHot = false;
          this.lineIsDone();
        }
        console.log("time left: " + this.timeLeft);
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

    proceed: function() {
      // either line is done, or we're starting
      if (!this.isTimerRunning()) {
        this.startTimer();
      } else { // skip to end
        this.lineIsDone();
      }
    },

    //----------------------------------------
    // advance the clock
    // sound horn, move to next state (end over, or next line up)
    //----------------------------------------
    lineIsDone: function() {
      console.log("Cease fire");
      this.rangeIsHot = false;
      this.timeLeft = 0;
      this.timerEndSeconds = 0;
      clearInterval( this.ticker );
      this.ticker = 0;

      // start next line if necessary
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

    // Red, then green, then yellow
    timerBackgroundClass: function() {
      if (!this.rangeIsHot) {
        return this.red;
      } else if (this.timeLeft < 30 ) {
        return this.yellow;
      } else {
        return this.green;
      }
    },

    //----------------------------------------------------------------------
    // update stats for person who picked trump suit, and defending team
    // called after every hand is done? Or just at end of game...FIXME
    //----------------------------------------------------------------------
    updateRoundPrefs: function( round ) {
      let oldRound = Util.loadData("round") || {};

      Util.saveData("stats", round );
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
        console.error( e );
      }
      // } else if (document.exitFullscreen) {
      //   document.exitFullscreen();

    }

  }
});
