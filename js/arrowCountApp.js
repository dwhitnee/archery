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


// TODO:
// Show last goal entered as current goal
// Fix goals to be array, not single strings (add coach?)
// o save weekly array of score data, goal data.
// o input/display method for weekly scores. (Score list plus empty score box (arrow count?))
// move input method for weekly Notes to below heatmap(?)
//   o edit single weekly Note, or list of uneditable Notes?
// allow coach to add/edit a weekly Note (prefixed by their name)

// - data is lost when you login (if you were saving locally)

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

let ServerURL = "https://ox5gprrilk.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  ServerURL = "https://317bll5em3.execute-api.us-west-2.amazonaws.com/dev/";
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

    isAdmin: false,
    coachView: null,      // archerId requested to view by coach
    coachId: null,        // requesting coach

    teamView: undefined,
    teamViewWeek: undefined,
    allArchers: [{name:"Loading..."}],
    allActiveArchers: [{name:"Loading..."}],

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

    coaches: [{ given_name: "loading..."}],
//              "KSL", "Josh", "Diane", "Alice", "Joel", "Maria", "Connor", "Mac"],

    days: ["M","T","W","Th","F","Sa","Su"],
    weekArrows: [],  // populate this from data.arrows
    weeksFocus: [],  // what to focus on each week
    weekScores: [300],  // populate this from data.scores?
    weekGoals: "",
    showAllGoals: false,
    noteEditMode: false,

    data: {
      arrows: [],      // 365 element list of data points. Need to translate for heatmap
      yearArrows: 0,
      exercises: [],
      notes: [],         // weekly (52 element arrays)
      scores: [        // weekly (52 element arrays)
        [{ score:300, arrows:30 },{ score:550, arrows:72 }]  // eg, week 15
      ]
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
                { from: -100,  to:   0, color: '#cccccc', foreColor: '#cccccc'},
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
    // version: "0.1"  // save arrow heatmap
    version: "0.2"  // edit notes, versioning works
  },

  // https://colorkit.co/palette/2c4875-5b4c82-8a508f-cc0863-ff6361-ff8531-ffa600-8cb357-18bfae-53cbef/
//#2c4875, #5b4c82, #8a508f, #cc0863, #ff6361, #ff8531, #ffa600, #8cb357, #18bfae and #53cbef.

  // watch global variables for reactivity
  watch: {
    async '$globalUser'( userAuth ) {
      if (this.coachView) {      // ignore in coach mode
        return;
      }
      console.log("New login from OAuth");
      await this.archerLogin( userAuth );
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

    // admin override on any page
    if (window.location.href.match( /#admin/ )) {
      this.isAdmin = true;
    }

    // allow past data to be viewed
    if (this.$route.query.year) {
      this.year = this.$route.query.year;
    }

    Util.setNamespace("AC_");  // arrowCount app

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
      this.coachId = this.$route.query.coach;
      await this.getArcher( this.coachView );
      if (this.user.id) {
        await this.getArcherData();

      } else {
        this.user.name = "No archer found";
        // no such archer?
      }

    } else {   // setup data without login

      this.user = Util.loadData("archer") || this.user;    // localstore only
      this.loadLocalArcherData();  // new function
      if (!this.data || !this.data.arrows) {
        this.loadLocalArrowDB();  // @deprecated, archerData should win IFF it exists
      }
      this.handleArrowUpdate();

      // use cached auth block to login latest version of archer
      if (this.user.auth) {
        await this.archerLogin( this.user.auth );
      }

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

        if (this.isLoggedInUserACoach() || this.isAdmin) {
          console.log("Coach view!");
          // this.loadAllArchers(); // part of loadCoaches?
          this.loadCoaches();
          this.openDialog("coachView");
        }
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

    this.weeksFocus = [""].concat( focus, focus, focus, focus, focus);
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
        url = url + "?user=" + archer + "&coach=" + this.user.id;
      }
      return url;
    },

    inProgress: function() {
      return this.saveInProgress || this.loadingData;
    },


    //----------------------------------------
    // is this an admin.
    // Should auth block contain a bit or should the user list be hardcoded?
    //----------------------------------------
    isLoggedInUserACoach: function() {
      return this.user.isCoach;
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
        alert("could not understand email address: " + newEmail );
        return;
      }
      user.given_name = user.name;
      user.auth = "email";
      await this.archerLogin( user );
    },

    //----------------------------------------
    // a new user has arrived via OAuth or otherwise (email auth chunk)
    // populate data from cloud (stuff it into localStore for now, too)
    //----------------------------------------
    async archerLogin( userAuth ) {
      // go get current archer record if we have one

      if (!userAuth || !userAuth.id) {
        return;
      }

      try {
        await this.getArcher( userAuth.id );

        if (!this.user.name) {
          console.log("No archer name found");
          return;
        }
        if (this.user.id) {
          console.log("Loaded " + this.user.name );
        } else {
          // new archer, create record
          this.user.id = userAuth.id;
          this.user.name = this.user.name || userAuth.name;

          // this is problematic, could be infinitely nested user object from email
          this.user.auth = userAuth;

          console.log("Creating new archer " + this.user.name );
          await this.updateArcher();
        }
        // copy over interesting immutable data
        this.user.auth = userAuth;
        this.user.given_name = userAuth.given_name;
        this.user.pictureUrl = userAuth.pictureUrl;

        // now load archer data (and nuke the local stuff)
        await this.getArcherData();

        this.saveLocalArcher();
        // this.saveLocalArrowDB();  // @deprecated: remove this 9/1/2024
        this.saveLocalArcherData();
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
      this.data = { arrows: [], notes: [], scores: [] };

      this.updateArcher();   // Just localstorage update since ID is gone
      this.updateArcherArrows();
      this.handleArrowUpdate();

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
    // chart data is not a 2D array. It is an object with all Monday's data, all of Tue's etc
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
      this.data.yearArrows = 0;
      for (let w=0; w < 52; w++) {
        weekTotals[w] = this.getWeekTotalFromDayOfYear(w*7);
        this.data.yearArrows += weekTotals[w];   // Keep annual total separate
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
      return "arrows:" + this.year;
    },

    saveLocalArcher: function() {
      Util.saveData("archer", this.user );
    },

    //----------------------------------------
    // keys: userId, year, arrows
    // @deprecated: use saveLocalArcherData() so we can save more than just arrowCount
    //----------------------------------------
    saveLocalArrowDB: function() {
      if (this.data.arrows) {
        Util.saveData( this.getDBKey(), this.data.arrows );
      }
    },
    //----------------------------------------
    // key is just "year" because we don't have a reliable userid
    //----------------------------------------
    saveLocalArcherData: function() {
      if (this.data) {
        Util.saveData("archerData:" + this.year, this.data );
      }
    },
    loadLocalArcherData: function() {
      let localData = Util.loadData("archerData:" + this.year);
      this.data = localData || this.data;  // if null, skip
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
      let week = this.getWeekNumber();
      this.weekGoals = this.data.notes[week];

      // go back in time to find the last goal we had
      for (; week >=0 && !this.weekGoals; week--) {
        this.weekGoals = this.data.notes[week];
      }

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
      let week = Math.floor( this.getDayOfThisMonday()/7 );
      if (week < 0) {
        week = 0;
      }
      return week;
    },

    //----------------------------------------------------------------------
    // figure out what day of year this monday was
    // for indexing into DB
    //
    // Fail:    Mon Apr 29 2024 00:56:44 GMT-0700 (Pacific Daylight Time)
    // Success: Mon Apr 29 2024 01:01:05 GMT-0700 (Pacific Daylight Time)
    // Because of f*ing Daylight Savings Time the math is off by an hour
    //----------------------------------------------------------------------
    getDayOfThisMonday: function() {
      let jan1 = new Date("1/1/" + this.year);
      let today = new Date();
      let monday = new Date();
      let dstOffset = 1000*60 * (jan1.getTimezoneOffset() - today.getTimezoneOffset());

      // monday is #1, Sunday is #0 (so Monday is 6 days ago)
      monday.setDate( today.getDate() - ((today.getDay() + 6) % 7)  );

      console.log("Monday is " + monday);
      return Math.floor((monday - jan1 + dstOffset) / (24*60*60*1000));
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
      if (this.coachView && !this.canCoachEdit()) {
        this.endEdit();
        return;
      }
      this.weekScores[index] = event.target.value|0;
      console.log("New score: " + this.weekScores[index] );
    },

    // dislpay <input> element and provide focus
    enterNoteEditMode: function() {
      this.noteEditMode = true;
      setTimeout( () => { this.$refs.notes.focus();}, 1);
    },

    abortNoteEdit: function() {
      this.weekGoals = this.data.notes[this.getWeekNumber()];
      this.noteEditMode = false;
    },

    async saveNote( event ) {
      if (this.coachView && !this.canCoachEdit()) {
        this.endEdit();
        return;
      }
      if (this.coachView) {
        this.weekGoals = "Coach: " + this.weekGoals;
      }

      //this.weekGoals = event.target.innerText.trim(); // v-model doesn't work for contenteditable

      this.data.notes[this.getWeekNumber()] = this.weekGoals;
      this.updateArcherNotes();
      this.noteEditMode = false;
    },

    //----------------------------------------
    // FIXME: hard coded to arrows and dataDisplay.arrows
    // FIXME: tap on phone gives wrong location for text box (when in landscape (relative to top of whole page)
    //----------------------------------------
    async editArrows( event, index ) {

      if (this.coachView && !this.canCoachEdit()) {
        this.endEdit(); return;
      }

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
    //    assumes it's a child of the dialog
    closeDialog( event ) {
      // this.closeDialogElement( event.target.parentElement );
      this.closeDialogElement( event.target.closest("dialog") );
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

    async getAllScores( name ) {
      if (!name) {
        console.log("No archer to load");
        return null;
      }
      let tournamentServerUrl = "https://fc8w67eln8.execute-api.us-west-2.amazonaws.com/dev/";

      try {
        this.loadingData = true;
        let response = await fetch( tournamentServerUrl + "archerAllResults?name=" + name );
        if (!response.ok) { throw await response.json(); }
        let result = await response.json();
        return result;
      }
      catch( err ) {
        alert("Problem getting archer " + Util.sadface + (err.message || err));
        return null;
      }
      finally {
        this.loadingData = false;
      }
    },


    //----------------------------------------
    // on login, get what we know about this archer and stuff it in "user" object
    //----------------------------------------
    async getArcher( userId ) {
      if (!userId) {
        console.log("No archer to load");
        return;
      }
      try {
        this.loadingData = true;
        let response = await fetch( ServerURL + "archer?userId=" + userId );
        if (!response.ok) { throw await response.json(); }
        let result = await response.json();
        if (result.id) {
          this.user = result;
        }
      }
      catch( err ) {
        alert("Problem getting archer " + Util.sadface + (err.message || err));
      }
      finally {
        this.loadingData = false;
      }
    },

    //----------------------------------------
    // are coaches allowed to change other archer's data?
    // should this be on a per-coach basis?
    //----------------------------------------
    canCoachEdit: function() {
      // return false;
      return true;
    },

    //----------------------------------------
    // if logged in user is a coach, and the coach of the impersonated user
    //----------------------------------------
    isCoachFor: function( archerId ) {
      return this.coachView && (this.user.coachId == this.coachId);
    },

    //----------------------------------------
    getCoachDisplayNameForArcher: function( archer ) {
      // coaches not loaded yet..
      if (Object.keys( this.coaches ).length < 2) {
        return "-";
      }

      if (archer.coachId) {
        return this.coaches[archer.coachId].given_name || this.coaches[archer.coachId].name;
      } else {
        return "-";
      }
    },

    //----------------------------------------
    // load all users and see who is a coach
    //----------------------------------------
    loadCoaches: async function() {
      // already loaded
      if (Object.keys( this.coaches ).length > 1) {
        return;
      }

      await this.loadAllArchers();
      this.coaches = [];

      for (let i=0; i < this.allArchers.length; i++) {
        let person = this.allArchers[i];
        if (person.isCoach) {
          this.coaches[person.id] = {
            id: person.id,
            name: person.name,
            given_name: person.given_name,
          };
        }
      }
    },

    //----------------------------------------
    // Admin?
    //----------------------------------------
    async getArchersByCoach( coach ) {

      try {
        this.loadingData = true;
        let response = await fetch( ServerURL + "archers?coach=" + coach );
        if (!response.ok) { throw await response.json(); }
        let archers = await response.json();
        this.archerList = archers;
      }
      catch( err ) {
        alert("Problem getting archer list " + Util.sadface + (err.message || err));
      }
      finally {
        this.loadingData = false;
      }
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

        let response = await fetch( ServerURL + "archerData?userId=" + id + "&year=" + this.year );
        if (!response.ok) { throw await response.json(); }
        data = await response.json();

        if (!outsideRequest) {        // populate the user
          data.arrows = data.arrows || [];
          data.notes = data.notes || [];
          data.scores = data.scores || [];
          this.data = data;
          this.handleArrowUpdate();
        }
      }
      catch( err ) {
        alert("Problem getting archer " + Util.sadface + (err.message || err));
      }
      finally {
        this.loadingData = false || outsideRequest;
      }

      return data;
    },


    //----------------------------------------
    // save archer attributes
    // (after new login, update name/coach)
    // @param archer - if null, update this.user (might want to update a coach, though)
    //----------------------------------------
    async updateArcher( archer ) {
      if (this.loadingData) {
        return;  // don't allow updates while still loading from DB
      }

      this.saveLocalArcher();

      if (!this.user.id) {
        // we are anonymous, can't to save to remote DB?
        // alert("No archer ID specified. Can't save to cloud without login");
        return;
      }

      if (!archer) {
        archer = this.user;
      }

      if (this.saveInProgress) { return; }

      if (this.coachView && !this.canCoachEdit()) { return; }

      console.log("changing archer to " + JSON.stringify( archer ));

      try {
        this.saveInProgress = true;
        let postData = archer;

        let response = await fetch( ServerURL + "updateArcher",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)
        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));
        if (result.id) {
          Object.assign( archer, result );
          // this.user = archer;
        }
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Reload page? Change name failed " +
              Util.sadface + (err.message || err));
      }

      finally {
        this.saveInProgress = false;
      }
    },


    //----------------------------------------
    // store this years arrow count (maybe other stuff soon?)
    //----------------------------------------
    async updateArcherArrows() {
      // this.saveLocalArrowDB();   // @deprecated
      this.saveLocalArcherData();
      // this.updateArcherData("arrows", this.data.arrows );
      this.updateArcherData();
    },
    async updateArcherScores() {
      this.saveLocalArcherData();
      // this.updateArcherData("scores", this.data.scores );
      this.updateArcherData();
    },
    async updateArcherNotes() {
      this.saveLocalArcherData();
      // this.updateArcherData("notes", this.data.notes );
      this.updateArcherData();
    },
    async updateArcherWorkouts() {
      this.saveLocalArcherData();
      // this.updateArcherData("workouts", this.data.workouts );
      this.updateArcherData();
    },

    //----------------------------------------
    // Save a year of data for one activity ("arrows", "exercises", ...)
    //
    // updateArcherData("arrows", this.data.arrows)  ?
    // POST id=id&year=year&type=arrows&data=...
    //----------------------------------------
    async updateArcherData() {
      if (this.coachView && !this.canCoachEdit()) {
        return;
      }

      // if (!dataType) {
      //   console.error("called function wrong, no dataType");
      //   alert("oops");
      //   debugger;
      // }

      if (!this.isSignedIn()) {
        console.error("tried to write to DB without a signin id");
        return;
      }

      if (this.saveInProgress) { return; }
      console.log("updating archer DB");

      try {
        this.saveInProgress = true;

        let postData = {
          userId: this.user.id,
          year: this.year,
          data: this.data,
        };

        let response = await fetch( ServerURL + "updateArcherData",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)

        // archerData sub elements don't have a version, only the overall data record
        let newData = await response.json();

        if (newData.version) {
           this.data = newData;     // { arrows: [], id: 131, year: 2024, version: 27, ... }
         }
      }
      catch( err ) {
        console.error("Update arrow count: " + JSON.stringify( err ));
        alert("Reload page or try again. Data may be out of date. Update failed " +
              Util.sadface + (err.message || err));
      }
      finally {
        this.saveInProgress = false;
      }
    },


    //----------------------------------------
    // load all names
    //----------------------------------------
    async loadAllArchers() {
      if (this.allArchers.length > 1) {
        return;   // been there done that.
      }

      this.loadingData = true;

      // go get all archers for coach view
      try {
        let response = await fetch( ServerURL + "archers");
        if (!response.ok) { throw await response.json(); }
        this.allArchers = await response.json();

        this.allArchers.sort((a, b) => ('' + a.coachId).localeCompare(b.coachId));
      }
      catch (err) {
        console.err( err );
      }
      finally {
        this.loadingData = false;
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
          // add all the year's arrows together
          archer.yearArrows = data.arrows.reduce((a, b) => a + b|0, 0);
        }
      }
      // remove inactive archers from list
      // this.allActiveArchers = this.allArchers.filter(( archer ) => archer.weekArrows[7] > 0);
      this.allActiveArchers = this.allArchers.filter(( archer ) => archer.yearArrows > 0);
      this.allActiveArchers.sort( (a,b) => a.name > b.name);

      this.loadingData = false;
    },

    exportToCSV: function() {
      let arrows = this.data.arrows;

      let csv = [[this.year + " Arrow counts for " + this.user.name]];
      csv.push( this.days.concat("Total"));

      // fill first week ending Sunday (probaly skip a couple days)
      let daysSinceMonday = this.getFillerDays();  // If Jan 1 is Wed, this is two


      // fill first odd shaped week
      let i=0, w1=0, firstWeek = [];

      for (; w1 < daysSinceMonday; w1++) {
        firstWeek[w1] = "";  // firstWeek filler until Jan1
      }
      for (; w1 < 7-daysSinceMonday; w1++) {
        firstWeek[w1] = arrows[i++];
      }
      firstWeek[7] = this.getWeekTotalFromDayOfYear(0);
      csv.push( firstWeek );

      while (i < 52*7) {
        let week = [];
        for (let w=0; w < 7; w++) {
          week[w] = arrows[i++];
        }

        week[7] = this.getWeekTotalFromDayOfYear(i-1);
        csv.push( week );
      }

      csv.push(["Annual Total", "", "", "", "", "", "", this.data.yearArrows]);
      Util.exportToCSV( csv, "arrow counts");
    }

  },
                 });
