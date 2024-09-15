/*global fetch, Vue, VueRouter, Util, QRCode */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2024, David Whitney
//  This file is part of Tournament Tools

// Archery Tournament Scorer is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//-----------------------------------------------------------------------


// TODO:
// archer data should be in cloud (how to uniquely ID?)

// archer ID is name?  How to avoid dupes at creation? Steal other archer?
//  Enforce each archer on unique phone? Steal vs overwrite?

//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 app for entering and viewing archery tournament results
//
/*  Data model example

    // PK,HK,RK (Primary key or hash key, range key) pick two

    // redundant, denormalize into Tournament obejct
    tournamentCodes {
      code: "XYZ"   // HK
      date: "1/1/2024"  // RK  (allows querying all of a day's tournaments...why?)
      id: 42069
    }

    // how to select by code? (ie, join a tournament)
    tournament {
      id: 42069,     // PK
      date: "1/1/2024", // secondady HK with code
      code: "XYZ",      // secondary Index on code and date (to replace tournamentCodes)

      description: "Peanut Farmer 1000",
      type: { "WA 300", ends: 10, arrows: 3, rounds: 1 }

      //  archers: [id, id, id, ...]
      //  bales: { name: "14", archers: [...] }
    }

    // DESIGN TODO: scoringGroup is really just a list of archers,
    // can bale be kept in each archer? can't edit group name then.
    // id could be name, but how to ensure uniqueness in a tournament? I guess I can't,
    // if one group has same name, then both bales/archers get merged.
    // group name lives only in the app to start with (unless created ahead of time)
    // archer menu (join different group) - need a list of
    //     groups then (just UNIQUE archer.scoringGroup?)
    // would have to delete archers if groups get messed up (ie, app starts over)
    //   admin control here?

    // FIXME: Scoring Group/order should be stored independent of scores.
    // It can be aggregated for a day's shooting though.

    // It's OK, because it can change from round to round as long as
    // there is only one current round.


    // SELECT * WHERE tournament="XYZ" and group="14" ORDER BY scoringGroupOrder
    archerTournament: {
      tournamentId: 42069,   // HK

      scoringGroup: 14,      // RK   bale #, could represent several bales
      scoringGroupOrder: 2,  // (1-4) priority of archers in group

      // id: 69,   // (1-999) or "bradyellison"?  unique only to tournament, not globally
      name: "Brandy Allison",   // secondary HK for stats?
      bow: "FSLR",
      ageGender: "AM",

      total: { score: 600, xCount: 59 }
      rounds: [
        {
           score: 300,
           xCount: 29,
           ends: [
             {
               arrows:  ["9","9","9"]
               subTotal: 27,
               runningTotal: 27,
               xCount: 0
             }
             {
               arrows:  ["X","8","M"]
               subTotal: 18,
               runningTotal: 45,
               xCount: 1
             }
           ]
        },
        // round 2...
      ]
  OR
          ends: [["9","9","9"], ["X","8","7",.]
          // computed
          endScore: [27, 25, ...]
          endXCount: [0,1...]
          runningTotal: [27, 52, ...]
          roundScore: 300,
          roundXCount: 29,
 }
*/
//  ----------------------------------------------------------------------

// AWS Lambda serverless API deployment endpoint

let dev = true;  // if on a desktop (ie, not deployed)
let localMode = true;

// FIXME: new lambda?
let serverURL = "https://ox5gprrilk.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  serverURL = "https://317bll5em3.execute-api.us-west-2.amazonaws.com/dev/";
}


// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [ ]
});

const ViewMode = {
  TOURNAMENT_START: "TOURNAMENT_START",
  ARCHER_LIST: "ARCHER_LIST",
  SCORE_SHEET: "SCORE_SHEET"
};

let app = new Vue({
  router,
  el: '#tournamentApp',

  //----------------------------------------
  // Data Model (drives the View, update these values only
  //----------------------------------------
  data: {
    message: "Lets do a tournament",
    saveInProgress: false,    // prevent other actions while this is going on
    loadingData: false,    // prevent other actions while this is going on
    adminView: false,

    mode: ViewMode.TOURNAMENT_START,    // what page to show
    foo: "foo",
    joinCode: "",  // tournament to join (XYZX)

    // a tournament is a set of rounds and a set of archer scoring
    // groups (e.g., bales) if scoring groups re-order, you need a new
    // tournament object or tournament archers need to be changed in
    // admin mode

    tournament: { },
    archers: [],           // on a particular bale (scoring group)
    scoringArcher: null,   // which archer we are currenty editing

    newGroupName: "",  // temp for data entry
    groupName: "",     // immutable key for this scoring group

    newArcher: {},     // candidate new archer data model for UI before saving
    nextArcherId: 0,   // using name as Id. Not great, but numbers are not unique.

    archer: {},    // current archer for ScoreSheet

    genders: [
      {full: "Male", abbrev: "M"},
      {full: "Female", abbrev: "F"}  // nope, not going there.
    ],
    ages: [
      { full: "Cub (U12)", abbrev: "U12" },
      { full: "Youth (U15)", abbrev: "U15" },
      { full: "YA (U18)", abbrev: "U18" },
      { full: "College  (U21)", abbrev: "U21" },
      { full: "Adult", abbrev: "A" },
      { full: "Old Fart (50+)", abbrev: "S" },
      { full: "Very Old Fart (60+)", abbrev: "SS" },
      { full: "Super Old Fart (70+)", abbrev: "MS" },
    ],

    bows: [  // Also Trad, Longbow, FS-L,
      { full: "Barebow", abbrev: "BBR" },
      { full: "Recurve", abbrev: "FSLR" },
      { full: "Compound", abbrev: "FS" },
      { full: "Fixed Pins", abbrev: "BHFS" }
    ],

    tournamentTypes: [
      {
        "description": "WA 300",
        "arrows": 3, "ends": 10, maxArrowScore: 10
      },
      {
        "description": "Lancaster 300",
        "arrows": 3, "ends": 10, maxArrowScore: 11
      },
      // {
      //   "description": "WA 600",
      //   "arrows": 3, "ends": 10, maxArrowScore: 10, rounds: 2
      // },
      {
        "description": "Blueface 300",
        "arrows": 5, "ends": 12, maxArrowScore: 5  // 3 rounds of 4 ends?
      },
      {
        "description": "Outdoor 720",
        "arrows": 6, "ends": 6, maxArrowScore: 10, rounds: 2
      },
      {
        "description": "NFAA 900",
        "arrows": 5, "ends": 5, maxArrowScore: 10, rounds: 3
      }
    ],


    showCredits: false,
    version: "0.1"  // create a tournament
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

    Util.setNamespace("TS");

    let tournamentId = this.$route.query.id;
    if (tournamentId) {
      this.tournament = await this.getTournamentById( tournamentId );
      let groupId = this.$route.query.groupId;  // scoring bale
      if (groupId) {
        this.archers = await this.getArchers( tournamentId, groupId );
      }
    }

    let foo = this;
    this.handleKeypress = (event) => {
      if (event.shiftKey && (event.key === "Z")) {
        console.error( foo );
        debugger;
      }
    };
    document.body.addEventListener("keydown", this.handleKeypress );
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

    isMode: function( mode ) {
      return this.mode == mode;
    },

    setGroupName: function() {
      this.groupName = this.newGroupName;
    },

    groupName: function() {
      return this.groupName || this.archers[0].groupName;
    },

    updateInProgress: function() {
      return this.saveInProgress || this.loadingData;
    },


    // do the math. From scratch each time?  Seems like overkill, but probably worth it
    // The alternative is archer.scoreEnd( end, arrows ) which updates subTotals
    //
    computeSubTotals: function( archer, round ) {
      let runningTotal = 0, xCount = 0;

      archer.roundTotal = 0;
      archer.xCountTotal = 0;
      archer.runningTotal = [];

      for (let end=0; end < archer.ends.length; end++) {
        this.scoreEnd( archer, end );
        runningTotal += archer.endScore[end];
        xCount += archer.endXCount[end];
        archer.runningTotal[end] = runningTotal;
      }
      archer.totalScore[round] = runningTotal;
      archer.xCount[round] = xCount;
    },

    //----------------------------------------
    // Update the running totals
    // @arg archer
    // @arg end - end number
    //----------------------------------------
    scoreEnd: function( archer, end ) {
      let arrows = archer.ends[end];  // scores for this end, e.g. ["X", "10", "9", "M", ...]
      archer.endScore[end] = 0;
      archer.endXCount[end] = 0;

      for (let a=0; a < arrows.length; a++) {
        if (arrows[a] == "X") { // 10 normally. 11 for Lancaster, 5 for BF
          archer.endScore[end] += this.tournament.type.maxArrowScore;
          archer.endXCount[end]++;
        } else {
          if (arrows[a] != "M") {  // miss
            archer.endScore[end] += arrows[a] | 0;  // convert "9" to int
          }
        }
      }
      this.computeSubTotals( archer, this.tournament.round );
    },

    joinTournament: function() {
      this.joinCode = this.joinCode.toUpperCase();
      this.tournament = this.getTournamentByCode( this.joinCode );
      if (!this.tournament.id) {
        alert("No tournament found named " + this.joinCode);
      }
    },

    // save to DB
    createTournament: function( event ) {
      if (this.tournament.id) {
        alert("Cannot modify an existing tournament. You must make a new one");
        return;
      }
      this.saveTournament();

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement );

      this.$forceUpdate();  // deep change to this.tournament does not trigger update

      console.log("tournament created " + JSON.stringify( this.tournament ));
    },

    // open scoring page for this archer  TODO
    selectArcher: function( archer ) {
      console.log("Here we go! " + archer.name);
      this.scoringArcher = archer;
    },

    addNewArcher: function( event ) {
      this.newArcher.tournamentId = this.tournament.id;
      this.newArcher.groupId = this.groupName;

      // This feels wonky. Archer order is part of metadata so we need
      // to add them to the list before we can save.
      // But metadata like versioning and any ID isn't created until archer saved so
      // we still need to update our local copy.  This isn't an issue if we save the whole
      // array at once, but I felt it was better to save archers
      // individually, even though their order on the bale is also saved with each archer

      this.archers.push( this.newArcher );   // add archer to list (order matters)
      let updatedArcher = this.updateArcher( this.newArcher );  // save and update metadata
      this.archers[this.archers.length-1] = updatedArcher;  // put updated archer in list

      this.newArcher = {};

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement );
    },

    removeArcherFromBale: function( archer ) {
      // this.bale.pop( archer );
    },

    startScoring: function() {
      for (let i=0; i < this.archers.length; i++) {
        this.updateArcher( this.archers[i]);  // save the current order of archers
      }

      this.mode = ViewMode.ARCHER_LIST;
    },

    //----------------z------------------------
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
      if (!dialog || this.dialogIsOpen) {  // can't open two dialogs at once
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

    qrcode: function() {
      let qrcode = new QRCode( document.getElementById("qrcode"),
                               "http://jindo.dev.naver.com/collie");

      let qrcode2 = new QRCode( document.getElementById("qrcode"), {
        text: "http://jindo.dev.naver.com/collie",
        width: 256,
        height: 256,
        // typeNumber : 4,   // https://www.qrcode.com/en/codes/
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H  // high (L,M,H)
      });

      qrcode.clear();
      qrcode.makeCode("http://naver.com");
    },


    //----------------------------------------
    //----------------------------------------
    // Tournament persistence
    //----------------------------------------
    //----------------------------------------
    getTournamentByCode: function( tournamentCode ) {
      if (!tournamentCode) {
        console.error("Tried to get null tournament");  debugger
        return {};
      }
      if (localMode) {
        return Util.loadData("tournament"+ tournamentCode) || {};
      } else {
        return this.loadTournamentByCodeFromDB( tournamentCode ) || {};
      }
    },

    //----------------------------------------
    getTournamentById: function( tournamentId ) {
      if (!tournamentId) {
        console.error("Tried to get null tournament"); debugger
        return {};
      }
      if (localMode) {
        return Util.loadData("tournament"+ tournamentId) || {};
      } else {
        return this.loadTournamentByIdFromDB( tournamentId ) || {};
      }
    },

    //----------------------------------------
    // Generate random 4 letter code
    // verify this ID doesn't exist already? TODO
    // This should take place server side to ensure uniqueness
    //----------------------------------------
    generateTournamentId: function() {
      let randomId = "";
      for (let i=0; i<4; i++) {
        randomId += String.fromCharCode( 65 + Util.random(26) );
      }
      return randomId;
    },

    //----------------------------------------
    saveTournament: function() {
      if (!this.tournament || !this.tournament.name) {
        return;
      }

      // this should take place server-side? No, use the locale of the adhoc app user
      this.tournament.date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      if (localMode) {
        this.tournament.code = this.generateTournamentId();
        this.tournament.id = this.tournament.code;
        Util.saveData("tournament"+ this.tournament.id, this.tournament );
      } else {
        this.tournament = this.saveTournamentToDB( this.tournament );  // ID/Code created in DB
      }
    },

    //----------------------------------------
    //----------------------------------------
    // Archer scorecard persistence
    //----------------------------------------
    // getArcher is dumb. Is it needed when two people might be scoring the same archer?
    // Just reload all archers in that case?  What about versioning.
    // Versioning should be on a single archer...  DB load would be on a single archer
    // level. Reload whol bale after each save? No, versioning takes care of that.
    // Versioning is just to prevent a conflict, optimistic locking should do most of the
    // time. Only an error if two people are updating the same archer, which is an error anyway
    async getArcher( tournamentId, archerId ) {
      throw new Error("WTF");
      // return this.archers[ archerId ]; this doesn't even work, archers is an array
      // there is no DB version of this, use loadTournamentArchers instead
    },

    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)a
    // Called only at the beginning of scoring and if there is a versioning error
    //----------------------------------------
    getArchers: function( tournamentId, groupId ) {
      if (localMode) {
        return Util.loadData("archers:"+tournamentId+"-"+groupId) || [];
      } else {
        return this.loadArchersFromDB( tournamentId, groupId ) || [];
      }
    },

    //----------------------------------------
    // update archer in DB.
    // @return archer so any metadata added can be updated in local copy
    //----------------------------------------
    updateArcher: function( archer ) {
      if (localMode) {
        // hacky way to store single archer in a group, stomp the whole thing
        Util.saveData("archers:"+archer.tournamentId+"-"+archer.groupId, this.archers );

        // iterate over archer array until we've found our man to update or be added
        return archer;
      } else {
        // save and update local copy with DB versioning and ID creation (if necessary)
        // also save their order in the group

        let i = this.archers.findIndex( a => (a.name == archer.name));
        archer.scoringGroupOrder = (i<0)? 0 : i;

        return this.saveArcherToDB( archer );
      }
    },



    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //----------------------------------------
    // load tournament from 4 letter code that is valid today only, use ID from here on out
    // code should only be used for ad-hoc tournaments, not ones set up in advance.
    //----------------------------------------
    async loadTournamentByCodeFromDB( tournamentCode ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      // server side will use date and short term code to get the persistent ID
      let date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      try {
        this.loadingData = true;

        let response = await fetch(serverURL +
                                   "tournaments?code=" + tournamentCode +
                                   "&date=" + date);
        if (!response.ok) { throw await response.json(); }
        return await response.json();
      }
      catch (err) {
        console.error( err );
        return null;
      }
      finally {
        this.loadingData = false;
      }
    },

    //----------------------------------------
    // load tournament by direct ID (when would this get used?)
    // in an ad-hoc tournament you'd only have the tournament code (XYZQ).
    // in an organized tournament you'd have the tournament and bale ID's
    // .../tournament?tournamentId=69&scoringGroup=42
    //----------------------------------------
    async loadTournamentByIdFromDB( tournamentId ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.loadingData = true;

        let response = await fetch(serverURL + "tournaments?id=" + tournamentId );
        if (!response.ok) { throw await response.json(); }
        return await response.json();
      }
      catch (err) {
        console.error( err );
        return null;
      }
      finally {
        this.loadingData = false;
      }
    },

    // async loadArcher() Not needed
    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)
    //----------------------------------------
    async loadArchersFromDB( tournamentId, groupId ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.loadingData = true;

        let response = await fetch(serverURL + "archers?tournamentId" + tournamentId +
                                   "&groupId = " + groupId );
        if (!response.ok) { throw await response.json(); }
        return await response.json();
      }
      catch (err) {
        console.error( err );
        return null;
      }
      finally {
        this.loadingData = false;
      }
    },


    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // ID to be generated remotely.
    //----------------------------------------
    async saveTournamentToDB( tournament ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( tournament ));
        if (!response.ok) { throw await response.json(); }

        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));
        return result;  // now with ID and code(?)
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
        return null;
      }
      finally {
        this.saveInProgress = false;
      }
    },

    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // Should ID be generated remotely? Probably.
    //----------------------------------------
    async saveArcherToDB( archer ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "updateArcher",
                                    Util.makeJsonPostParams( archer ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks
        // we should have (last updated, version)
        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));

        // return updated object (with versioning data, etc)
        return result;
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
        return null;
      }
      finally {
        this.saveInProgress = false;
      }
    },

  },

});
