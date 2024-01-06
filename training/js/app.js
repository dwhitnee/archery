/*global fetch, Vue, VueRouter, Util, VueApexCharts */
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
//  A VueJS 2.1 app for entering and viewing training data
//
//  Arrow Count, workouts, mental training

//  Calendar View
//  Heat Map
//  ----------------------------------------------------------------------

// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [ ]
});

Vue.component('apexchart', VueApexCharts);

let app = new Vue({
  router,
  el: '#trainingApp',

  components: {
    apexchart: VueApexCharts,
  },

  //----------------------------------------
  // Data Model (drives the View, update these values only
  //----------------------------------------
  data: {
    message: "Hello",

    heatmap: {
      series: {},
      chartOptions: {
        chart: {
          height: 350,
          type: 'heatmap',
        },
        dataLabels: {
          enabled: true
        },
        colors: ["#008FFB"],
        title: {
          text: 'HeatMap'
        },
      },
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
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    // TODO: potential future use for hard coded URL to indoor or outdoor round
    this.roundType = this.$route.query.round;

    this.round = Util.loadData("round") || this.round;

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

    // https://apexcharts.com/vue-chart-demos/heatmap-charts/multiple-series/
    doHeatmap: function() {

      let days = ["M","T","W","R","F","S","S"];
      let data = [];
      let range = { min: 0, max: 90 };

      for (let d=0; d < 7; d++) {
        let year = [];
        for (let w=0; w < 52; w++) {
          year[w] = Util.random(100);
        }
        year[0] = d;

        data[6-d] = {
          name: days[d],
          data: year,
        };
      }

      this.heatmap.series = data;
    },

    //----------------------------------------------------------------------
    // update stats for person who picked trump suit, and defending team
    // called after every hand is done? Or just at end of game...FIXME
    //----------------------------------------------------------------------
    updateRoundPrefs: function( round ) {
      // let oldRound = Util.loadData("round") || {};
      Util.saveData("round", round );
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

  }
});
