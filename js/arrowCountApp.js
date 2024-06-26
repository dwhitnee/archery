/*global fetch, Vue, VueRouter, Util, VueApexCharts, user */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2024, David Whitney
//  This file is part of Tournament Tools

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

// TODO:
//   weekly focus/notes section
// revert to previous? Save yesterday/last week's data for revert?
//  ----------------------------------------------------------------------

// AWS Lambda serverless API deployment endpoint

let dev = false;  // if on a desktop (ie, not deployed)

let serverURL = "https://ox5gprrilk.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  serverURL = "https://317bll5em3.execute-api.us-west-2.amazonaws.com/dev/";
}


// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [ ]
});

Vue.component('apexchart', VueApexCharts);

// Vue.directive('focus', {
//   inserted: function (el) {
//     el.focus();
//   }
// });

// Update globals this way? ickx
// Vue.set( Vue.prototype, '$globalUser', user );

const globalUser = Vue.observable({
  user: {}
});

Object.defineProperty(Vue.prototype, '$globalUser', {
  get() {
    return globalUser.user;
  },
  set(value) {
    globalUser.user = value;
  }
});



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
    message: "Weekly Arrow Counter",
    saveInProgress: false,    // prevent other actions while this is going on
    loadingData: false,    // prevent other actions while this is going on
    doEmailLogin: false,   // toggle to enter email address as userId

    coachView: false,
    teamView: undefined,
    teamViewWeek: undefined,
    allArchers: [{name:"Loading..."}],

    noUser: {
      id: "",
      name: "",
      coach: "KSL"
    },
    user: {
      id: "",    // id and name are populated from login
      name: "",
      coach: "KSL",
    },

    coaches: ["KSL", "Josh", "Diane", "Alice", "Joel"],

    days: ["M","T","W","Th","F","Sa","Su"],
    weekArrows: [],  // populate this from data.arrows
    weeksFocus: [],  // what to focus on each week
    weekScores: [300],  // populate this from data.scores?
    weekGoals: "get good", // populate this from data.notes?

    data: {
      // 365 element list of data points. Need to translate for heatmap
      arrows: [],
      exercises: []
    },
    dataDisplay: {},
    editing: false,

    year: (new Date()).getFullYear(),
    // year: 2022,

    heatmap: {
      series: {},
      chartOptions: {
        tooltip: {
          enabled: false
        },
        dataLabels: {
          enabled: true
        },
        responsive: [{
          breakpoint: 1500,
          options: {
            chart: {
              width: 1500
            }
          }
        }],

        chart: {
          selection: {
            enabled: true,
          },
          events: {
             // dataPointMouseEnter: function( event, obj, data) { app.foop(event,obj,data); },
             // dataPointMouseLeave: function( event, obj, data) { app.foop(event,obj,data); },
             // dataPointSelection:  function( event, obj, data) { app.foop(event,obj,data); },
           },
          type: 'heatmap',
        },
        plotOptions: {
          heatmap: {
            enableShades: true,
            colorScale: {
              ranges_orig: [
                { from: -1,  to:   0, color: '#cccccc'},
                { from: 1,   to: 100, color: '#008FFB'},
                { from: 101, to: 200, color: '#00E396'},
                { from: 201, to: 300, color: '#aaaa00'},
              ],
              ranges: [
                { from: -1,  to:   0, color: '#cccccc', foreColor: '#cccccc'},
                { from: 1,   to:  50, color: '#53cbef', foreColor: '#aabbcc' },
                { from: 51,  to: 100, color: '#18bfae'},
                { from: 101, to: 200, color: '#8cb357'},
                { from: 201, to: 300, color: '#ffa600'},
                { from: 301, to: 400, color: '#ff8531'},
                { from: 401, to: 500, color: '#ff6361'},
                { from: 501, to: 600, color: '#cc0863'},
                { from: 601, to: 700, color: '#8a508f'},
                { from: 701, to: 800, color: '#5b4c82'},
                { from: 801, to: 8000, color: '#2c4875'},
              ],
            },
          },
        },
        // colors: ["#008FFB"],
        title: {
          text: 'Training HeatMap - click to edit'
        },
      },
    },

    showCredits: false,
    version: "0.1"
  },

  // https://colorkit.co/palette/2c4875-5b4c82-8a508f-cc0863-ff6361-ff8531-ffa600-8cb357-18bfae-53cbef/
//#2c4875, #5b4c82, #8a508f, #cc0863, #ff6361, #ff8531, #ffa600, #8cb357, #18bfae and #53cbef.

  // watch global variables for reactivity
  watch: {
    async '$globalUser'( user ) {
      if (this.coachView) {      // ignore in coach mode
        return;
      }
      console.log("New login from OAuth");
      await this.archerLogin( user );
      // this.$globalUser = value;
    }
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
  async mounted() {
    // handle broken promises.
    window.addEventListener('unhandledrejection', function(event) {
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    // set up heatmap handlers
    this.initChartCallbacks();

    this.teamView = this.$route.query.teamView;
    if (typeof this.teamView !== 'undefined') {
      this.teamView = parseInt( this.teamView );
      if (!isNaN( this.teamView )) {
        await this.loadAllArchers();
        await this.loadWeeksArrowsForAllArchers();
      }
    }

    // Coach view of an archer
    this.coachView = this.$route.query.user;
    if (this.coachView) {
      await this.getArcher( this.coachView );
      if (this.user.id) {
        await this.getArcherData();

      } else {
        this.user.name = "No archer found";
        // no such archer?
      }

    } else {   // setup data without login

      this.user = Util.loadData("archer") || this.user;    // localstore only
      this.loadLocalArrowDB();

      await this.archerLogin( this.user );

      // scroll chart to current week
      let div = document.getElementById("chart");
      let week = this.getWeekNumber();
      if (div && week > 0) {
        div.scrollTo( week*20, 0);
      }

      // i wich we could tell if a login were in progress
      // currently we show localstorage view, then flash to cloud view
    }

    this.handleKeypress = (event) => {
      if (event.shiftKey && (event.key === "C")) {
        console.log("Coach view!");
        this.loadAllArchers();
        this.openDialog("coachView");
      }
    };
    document.body.addEventListener("keydown", this.handleKeypress );

    // FIXME make this editable in DB
    let focus = [
      "Breathing",
      "Stance & Posture",
      "Hook & Grip",
      "Set, Set Up & Alignment",
      "Scoring Night",
      "Loading & Anchor",
      "Transfer & Expansion",
      "Release & Follow Through",
      "Mental Game",
      "Game Night"
    ];

    this.weeksFocus = [""].concat( focus, focus, focus);
    let thisWeeksFocus = this.weeksFocus[ this.getWeekNumber() ];
    console.log("Week " + this.getWeekNumber() + "'s focus is " + thisWeeksFocus );
    this.setMessage( thisWeeksFocus );
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


    archerUrl: function( archer ) {
      let url = document.location.origin + document.location.pathname;
      if (archer) {
        url = url + "?user=" + archer;
      }
      return url;
    },

    inProgress: function() {
      return this.saveInProgress || this.loadingData;
    },


    //----------------------------------------
    // login with just an email address (no password)
    // this is just so we can get a name and ID
    //----------------------------------------
    async emailLogin( newEmail ) {
      // this.user.id is email now
      this.doEmailLogin = false;  // we're done with the UI

      let user = {
        id: newEmail
      };
      let match = user.id.match( /^(.*)@/);
      if (match && match[1]) {
        user.name = match[1];
      } else {
        alert("could not understnad email address: " + newEmail );
        return;
      }
      user.given_name = user.name;
      user.auth = {
        auth: "email"
      };
      await this.archerLogin( user );
    },

    //----------------------------------------
    // a new user has arrived via OAuth or otherwise
    // populate data from cloud (stuff it into localStore for now, too)
    //----------------------------------------
    async archerLogin( user ) {
      // go get current archer record if we have one

      if (!user || !user.id) {
        return;
      }

      try {
        await this.getArcher( user.id );

        if (!this.user.name) {
          console.log("No archer name found");
          return;
        }
        if (this.user.id) {
          console.log("Loaded " + this.user.name );
        } else {
          // new archer, create record
          this.user.id = user.id;
          this.user.name = this.user.name || user.name;
          this.user.auth = user;
          console.log("Creating new archer " + this.user.name );
          await this.updateArcher();
        }
        // copy over interesting immutable data
        this.user.auth = user;
        this.user.given_name = user.given_name;
        this.user.pictureUrl = user.pictureUrl;

        // now load archer data (and nuke the local stuff)
        await this.getArcherData();

        this.saveLocalArcher();
        this.saveLocalArrowDB();
      }
      catch( err ) {
        console.error("WTF? " + err );
      }
    },

    //----------------------------------------
    // redirect to google to dump cookies, or just empty user record
    // empty archerData too?
    //----------------------------------------
    async logout() {
      let auth = this.user.auth.auth;
      this.user = this.noUser;
      this.updateArcher();   // Just localstorage update since ID is gone
      this.data.arrows = [];
      this.updateArcherArrows();

      // hack to rerender google button, F this
      window.setTimeout(function() {
        console.log("re-rendering google login - WTF");
        window.google.accounts.id.renderButton(
          document.getElementById('g_id_onload'),
          { theme: 'outline', type: "standard",shape: "pill", size: 'large', text: "signin" });
      }, 1000);


      if (auth =="google") {
        document.location.href = "https://www.google.com/accounts/Logout?continue=https://appengine.google.com/_ah/logout?continue=" + location.href;
      }
    },

    //----------------------------------------
    // transform year of data into heatmap format
    // chart data is not a 2D array. It is an object with all of Monday's data, all of Tue's etc
    //
    // https://apexcharts.com/vue-chart-demos/heatmap-charts/multiple-series/
    //----------------------------------------
    updateHeatmapFromData: function( yearOfData ) {
      let data = [];
      // let range = { min: 0, max: 90 };

      let gapUntilMonday = this.getFillerDays();

      for (let d=0; d < 7; d++) {
        let yearOfWeekdays = [];
        for (let w=0; w < 52; w++) {
          if ((w == 0) && d < gapUntilMonday) {
            yearOfWeekdays[w] = -1;
          } else {
            // need data validation here
            let val = yearOfData[w*7+d-gapUntilMonday]|0;
            if (isNaN(parseFloat( val ))) {
              val = 0;
            }
            yearOfWeekdays[w] = val;
          }
        }

        data[7-d] = {
          name: this.days[d],
          data: yearOfWeekdays,
        };
      }

      let weekTotals = [];
      for (let w=0; w < 52; w++) {
        weekTotals[w] = this.getWeekTotalFromDayOfYear(w*7);
      }

      // weekly total
      data[0] = {
        name: "Total",
        data: weekTotals
      };

      this.heatmap.series = data;
    },


    // watch this.data.arrow and do update UI - Vue should do this sorta?
    handleArrowUpdate: function() {
      this.populateThisWeek();
      this.updateHeatmapFromData( this.data.arrows );
    },

    //----------------------------------------
    // If we have a credential we can do more (like save to a database)
    // If not we can only use the localstorage on the browser
    //----------------------------------------
    isSignedIn: function() {
      return this.user.id;
    },

    getDBKey: function() {
      // return this.user.id + ":arrows:" + this.year;
      return "arrows:" + this.year;
    },

    saveLocalArcher: function() {
      Util.saveData("archer", this.user );
    },

    //----------------------------------------
    // keys: userId, year, arrows
    //----------------------------------------
    saveLocalArrowDB: function() {
      if (this.data.arrows) {
        Util.saveData( this.getDBKey(), this.data.arrows );
      }
    },

    //----------------------------------------
    // arrow DB is a 365 element array of arrow counts for every day of the year
    // saved to localStorage.
    // If cloud is available, login callback will load all data
    //----------------------------------------
    loadLocalArrowDB: function() {
      this.data.arrows = Util.loadData( this.getDBKey() ) || [];
      this.handleArrowUpdate();
    },


    //----------------------------------------
    // Find this Monday, find index into DB, and populate week
    //----------------------------------------
    populateThisWeek: function() {
      this.weekArrows = [];

      let monday = this.getDayOfThisMonday();
      for (let i=0; i < 7; i++) {
        let arrows = this.data.arrows[monday+i];
        if (arrows) {
          this.weekArrows[i] = arrows;
        }
      }

    },

    //----------------------------------------
    // Assuming weeks start on Monday, which week number are we in (0 indexed)
    //----------------------------------------
    getWeekNumber: function() {
      return Math.floor( this.getDayOfThisMonday()/7 );
    },

    //----------------------------------------------------------------------
    // figure out what day of year this monday was
    // for indexing into DB
    //----------------------------------------------------------------------
    getDayOfThisMonday: function() {
      let jan1 = new Date("1/1/" + this.year);
      let today = new Date();
      let monday = new Date();

      // monday is #1, Sunday is #0 (so Monday is 6 days ago)
      monday.setDate( today.getDate() - ((today.getDay() + 6) % 7)  );

      console.log("Monday is " + monday);
      return Math.floor((monday - jan1) / (24*60*60*1000));
    },
    //----------------------------------------
    // given heatmap mouse event data, return [0-365) date index into DB
    //----------------------------------------
    convertChartIndexToDate: function( chartData ) {
      let chartRows = 7+1;  // not 8 days of week, 8 rows in chart
      let week = chartData.dataPointIndex;
      let day = chartRows - chartData.seriesIndex;  // days are reverse order(!)
      if (day > 7) {
        // skip Total row
        return -1;
      }
      return week*7 + day - this.getFillerDays() - 1;
    },

    //----------------------------------------
    // days until Monday - used to space calendar out properly in chart view
    //----------------------------------------
    getFillerDays: function() {
      let jan1 = new Date("1/1/" + this.year);
      let fillerDays = jan1.getDay() - 1;  // Monday is 1, Sunday is 0
      if (fillerDays < 0) {
        fillerDays = 6;   // Sunday
      }
      return fillerDays;
    },

    //----------------------------------------
    // Calculate actual day and get some data for that day to show
    //----------------------------------------
    pointEnter: function( event, obj, data ) {
      if (this.editing) {
        return;
      }

      let index = this.convertChartIndexToDate( data );
      if (index < 0) {
        return;
      }
      let date = this.getDateFromDayOfYear( index );

      this.dataDisplay = {
        arrows: this.data.arrows[index] || "0",
        date: date.toLocaleString( 0, { dateStyle: "medium"} ),
        day: date.toLocaleString( 0, { weekday: "short" }),
        weekArrows: this.getWeekTotalFromDayOfYear( index )
      };
    },

    getDateFromDayOfYear: function( doy ) {
      let jan1 = new Date("1/1/"+this.year);
      return new Date( jan1.setDate( jan1.getDate() + doy ));
    },

    getWeekTotalFromDayOfYear: function( doy ) {
      let weekTotal = 0;   // arrow count since Monday of the week of the given date
      let date = this.getDateFromDayOfYear( doy );
      let offset = date.getDay() - 1;  // Monday is day 1, not zero (Sunday)
      if (offset<0) {
        offset = 6;
      }

      for (let i=0; i<7; i++) {
        weekTotal += this.data.arrows[doy+i-offset] ||0;
      }

      return weekTotal;
    },

    //----------------------------------------
    // allow editing of the given day
    // open editable pane, wait for submit
    //----------------------------------------
    pointSelect: function( event, obj, data ) {
      if (this.editing) {
        return;
      }

      this.currentIndex = this.convertChartIndexToDate( data );
      if (this.currentIndex < 0) {
        this.editing = false;
        return;
      }

      this.editing = true;
      //this.$refs.arrowInput.$el.focus();  // eww, use v-focus directive?
      setTimeout( () => {
        let input = document.getElementById("arrowInput");
        if (input) {
          input.style.top = event.y-30+"px";
          input.style.left = event.x-15+"px";
          input.focus();
          input.select();

        }
      }, 1 );
    },

    endEdit: function() {
      this.editing = false;
      this.currentIndex = 0;
    },

    //----------------------------------------
    // FIXME: how to store weekly scores, under data? indexed 0-51?
    //----------------------------------------
    async editScores( event, index ) {
      if (this.coachView) { this.endEdit(); return; }
      this.weekScores[index] = event.target.value|0;

      console.log("New score: " + this.weekScores[index] );
    },


    //----------------------------------------
    // FIXME: hard coded to arrows and dataDisplay.arrows
    // FIXME: tap on phone gives wrong location for text box (when in landscape (relative to top of whole page)
    //----------------------------------------
    async editArrows( event, index ) {
      if (this.coachView) { this.endEdit(); return; }

      // direct heatmap update (index is day of year)
      if (index === undefined) {
        this.data.arrows[this.currentIndex] = this.dataDisplay.arrows|0;
        this.handleArrowUpdate(); // update week as well.

      } else {      // weekly list update (index is day of this week)
        let monday = this.getDayOfThisMonday();

        // should this be v-model instead? to handle strings
        this.data.arrows[monday+index] = event.target.value|0;
        this.handleArrowUpdate();
      }

      console.log("Updating day " + this.currentIndex + " to " + this.dataDisplay.arrows);

      // SAVE TO DB (cloud or local)
      await this.updateArcherArrows();

      // FIXME - hardcoded
      // Tell Vue this element changed - go read new data
      this.$refs.arrowCount.updateSeries( this.heatmap.series );

      this.endEdit();
    },

    //----------------------------------------
    // handle mouse events on heatmap
    // chart is hardcoded in as "arrowCount"  FIXME
    //----------------------------------------
    initChartCallbacks: function() {
      let events = {
        dataPointMouseEnter: (a,b,c) => { this.pointEnter(a,b,c); },
        // dataPointMouseLeave: (a,b,c) => { this.pointLeave(a,b,c); },
        dataPointSelection:  (a,b,c) => { this.pointSelect(a,b,c); },
      };

      this.heatmap.chartOptions.chart.events = events;

      console.log("callbacks updated");
      this.$refs.arrowCount.updateOptions( this.heatmap.chartOptions );
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


    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //----------------------------------------
    // on login, get what we know about this archer
    //----------------------------------------
    async getArcher( userId ) {
      if (!userId) {
        console.log("No archer to load");
        return;
      }
      try {
        this.loadingData = true;
        let response = await fetch(serverURL + "archer?userId=" + userId );
        if (!response.ok) { throw await response.json(); }
        let archer = await response.json();
        if (archer.id) {
          this.user = archer;
        }
      }
      catch( err ) {
        alert("Problem getting archer " + Util.sadface + (err.message || err));
      }
      this.loadingData = false;
    },

    //----------------------------------------
    // Admin?
    //----------------------------------------
    async getArchersByCoach( coach ) {

      try {
        this.loadingData = true;
        let response = await fetch(serverURL + "archers?coach=" + coach );
        if (!response.ok) { throw await response.json(); }
        let archers = await response.json();
        this.archerList = archers;
      }
      catch( err ) {
        alert("Problem getting archer list " + Util.sadface + (err.message || err));
      }
      this.loadingData = false;
    },


    //----------------------------------------
    // on login, get what we know about this archer
    // If @id is set, this is an outside request for a different archer (coach or team view)
    //----------------------------------------
    async getArcherData( id ) {
      let data, outsideRequest = true;

      try {
        this.loadingData = true;
        if (!id) {
          id = this.user.id;
          outsideRequest = false;
        }

        let response = await fetch(serverURL + "archerData?userId=" + id + "&year=" + this.year );
        if (!response.ok) { throw await response.json(); }
        data = await response.json();
        if (data.id) {
          if (!outsideRequest) {
            this.data = data;
            this.handleArrowUpdate();
          }
        }
      }
      catch( err ) {
        alert("Problem getting archer " + Util.sadface + (err.message || err));
      }
      this.loadingData = false || outsideRequest;

      return data;
    },


    //----------------------------------------
    // save archer attributes
    // (after new login, update name/coach)
    //----------------------------------------
    async updateArcher() {
      this.saveLocalArcher();

      if (!this.user.id) {
        // we are anonymous, how to save to DB? Use name as ID?  FIXME
        // alert("No archer ID specified. Can't save to cloud without login");
        return;
      }

      if (this.saveInProgress) { return; }
      if (this.coachView) { return; }

      console.log("changing archer to " + JSON.stringify( this.user ));

      try {
        this.saveInProgress = true;
        let postData = this.user;

        let response = await fetch( serverURL + "updateArcher",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)
        let archer = await response.json();
        console.log("update resulted in " + JSON.stringify( archer ));
        if (archer.id) {
          this.user = archer;
        }
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
      }

      this.saveInProgress = false;
    },


    //----------------------------------------
    // store this years arrow count (maybe other stuff soon?)
    //----------------------------------------
    async updateArcherArrows() {
      this.saveLocalArrowDB();
      this.updateArcherData("arrows", this.data.arrows );
    },

    async updateArcherWorkouts() {
      this.updateArcherData("workouts", this.data.workouts );
    },

    //----------------------------------------
    // Save a year of data for one activity ("arrows", "exercises", ...)
    //
    // updateArcherData("arrows", this.data.arrows)  ?
    // POST id=id&year=year&type=arrows&data=...
    //----------------------------------------
    async updateArcherData( dataType, data ) {
      if (this.coachView) { return; }

      if (!this.isSignedIn()) {
        console.error("tried to write to DB without a signin id");
        return;
      }

      if (this.saveInProgress) { return; }
      console.log("updating " + dataType + " count to DB");

      try {
        this.saveInProgress = true;

        let postData = {
          userId: this.user.id,
          year: this.year,
          data: data,
          dataType: dataType
        };

        let response = await fetch( serverURL + "updateArcherData",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)

        // FIXME - should this be done?
        // archerData sub elements don't have a version, only the overall data record
        let newData = await response.json();
        // if (newData.year) {
        //   this.data[dataType] = newData; // { arrows: [], id: 131, year: 2024, version: 2 }
        // }
      }
      catch( err ) {
        console.error("Update arrow count: " + JSON.stringify( err ));
        alert("Try again. Update failed " +
              Util.sadface + (err.message || err));
      }

      this.saveInProgress = false;
    },


    //----------------------------------------
    // load all names
    //----------------------------------------
    async loadAllArchers() {
      // go get all archers for coach view
      try {
        let response = await fetch(serverURL + "archers");
        if (!response.ok) { throw await response.json(); }
        this.allArchers = await response.json();

        this.allArchers.sort((a, b) => (a.coach > b.coach));
      }
      catch (err) {
        console.err( err );
      }
    },

    // load archer table for different week
    async nextTeamWeek() {
      this.teamView--;
      await this.loadWeeksArrowsForAllArchers();
    },
    async prevTeamWeek() {
      this.teamView++;
      await this.loadWeeksArrowsForAllArchers();
    },
    async showTeamWeek() {
      this.teamView=0;
      await this.loadAllArchers();
      await this.loadWeeksArrowsForAllArchers();
    },


    //----------------------------------------
    // load arrow counts for everyone
    //----------------------------------------
    async loadWeeksArrowsForAllArchers() {
      this.loadingData = true;

      let monday = this.getDayOfThisMonday();

      if (this.teamView) {
        monday -= 7 * parseInt( this.teamView );
      }
      this.teamViewWeek = new Date( this.year, 0, monday+1) ;

      this.allArchers.sort( (a,b) => a.name > b.name);

      for (let i=0; i < this.allArchers.length; i++) {
        let archer = this.allArchers[i];
        archer.weekArrows = [];

        console.log("Loading " + archer.name );

        let data = await this.getArcherData( archer.id );
        if (data && data.arrows) {
          let total = 0;
          for (let i=0; i < 7; i++) {
            archer.weekArrows[i] = data.arrows[monday+i];
            if (archer.weekArrows[i]) {
              total += archer.weekArrows[i];
            }
          }
          archer.weekArrows[7] = total;
        }
      }
      this.loadingData = false;
    },

  },

});
