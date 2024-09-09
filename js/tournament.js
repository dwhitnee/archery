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

    tournamentCodes {
      code: "XYZ"   // HK
      date: "1/1/2024"  // RK  (allows querying all of a day's tournaments...why?)
      id: 42069
    }

    // how to select by code? (ie, join a tournament)
    tournament {
      id: 42069,     // PK
      date: "1/1/2024",
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

    // I just dont like this table - THIS SHOULD NOT EXIST
    scoringGroup {
      tournamentId: 42069,  // in tournament and archer  (HK)
      id: 42,               // in archer (only needs to be unique to tournament (1-200) RK
      name: "Bale 42",      // anywhere? (add to archer)
    }


    // SELECT * WHERE tournament="XYZ" and group="14" ORDER BY scoringGroupOrder
    archerTournament: {
      tournamentId: 42069,   // HK

      scoringGroup: 14,      // RK   bale #, could represent several bales
      scoringGroupOrder: 2,  // (1-4) priority of archers in group

      // id: 69,   // (1-999) or "bradyellison"?  unique only to tournament, not globally
      name: "Brandy Allison",   // secondary HK for stats?
      bow: "FSLR",
      ageGender: "AM",
      ends: [["9","9","9"], ["X","8","7",.]
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

    foo: "foo",  // to be removed

    joinId: "",  // tournament to join

    // a tournament is a set of rounds and a set of archer scoring groups (e.g., bales)
    // if scoring groups re-order, you need a new tournament object
    tournament: { },
    archers: [],           // on a particular bale (scoring group)
    scoringArcher: null,   // which archer we are currenty editing

    newGroupName: "",  // temp for data entry
    groupName: "",     // immutable key for this scoring group

    newArcher: {},     // candidate new archer data model for UI before saving
    nextArcherId: 0,   // using name as Id. Not great, but numbers are not unique.

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
        "arrows": 3, "ends": 10
      },
      // {
      //   "description": "WA 600",
      //   "arrows": 3, "ends": 10, rounds: 2
      // },
      {
        "description": "Blueface 300",
        "arrows": 5, "ends": 12
      },
      {
        "description": "Outdoor 720",
        "arrows": 6, "ends": 12
      },
      {
        "description": "NFAA 900",
        "arrows": 5, "ends": 5, rounds: 3
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
      this.tournament = await this.loadTournament( tournamentId );
      let groupId = this.$route.query.groupId;  // scoring bale
      if (groupId) {
        this.archers = await this.loadArchers( tournamentId, groupId );
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

    setGroupName: function() {
      this.groupName = this.newGroupName;
    },

    // [0, n)
    random: function( max ) { return Math.floor(max * Math.random());  },

    updateInProgress: function() {
      return this.saveInProgress || this.loadingData;
    },

    joinTournament: function() {
      this.joinId = this.joinId.toUpperCase();
      this.loadTournament( this.joinId );
    },

    // save to DB
    createTournament: function( event ) {
      if (this.tournament.id) {
        alert("Cannot modify an existing tournament. You must make a new one");
        return;
      }
      this.saveTournament( this.tournament );

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

      this.archers.push( this.newArcher );
      this.updateArcher( this.newArcher );

      // Archer is created per tournament, there is no unique overall archer PK

      this.newArcher = {};

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement );
    },

    removeArcherFromBale: function( archer ) {
      // this.bale.push( archer );
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


    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //----------------------------------------
    // get description of this tournament
    //----------------------------------------
    async getTournament( id ) {
      if (!id) {
        console.log("No tournament id to load");
        return;
      }
      try {
        this.loadingData = true;
        let response = await fetch(serverURL + "tournament?id=" + id );
        if (!response.ok) { throw await response.json(); }
        let tournament = await response.json();
        if (tournament.id) {
          this.tournament = tournament;
        }
      }
      catch( err ) {
        alert("Problem getting tournament " + Util.sadface + (err.message || err));
      }
      this.loadingData = false;
    },

    //----------------------------------------
    // get all archers and arrow counts on this bale or scoring group
    //----------------------------------------
    async getArcherGroup( tournamentId, groupName ) {
      try {
        this.loadingData = true;
        let response = await fetch(serverURL + "tournamentArchers" +
                                   "?tournamentId=" + tournamentId +
                                   "&groupName=" + groupName );
        if (!response.ok) { throw await response.json(); }
        let archers = await response.json();
        if (archers) {
          this.archers = archers;
        }
      }
      catch( err ) {
        alert("Problem getting tournament archer group " + Util.sadface + (err.message || err));
      }
      this.loadingData = false;

    },



    //----------------------------------------
    //----------------------------------------
    // Tournament persistence
    //----------------------------------------
    //----------------------------------------
    async loadTournamentByCode( tournamentCode ) {
      if (!tournamentCode) {
        console.error("Tried to get null tournament");
        debugger
        return;
      }
      if (localMode) {
        this.tournament = Util.loadData("tournament"+ tournamentCode) || {};
      } else {
        this.tournament = this.loadTournamentByCodeFromDB( tournamentCode );
      }
      if (this.tournament) {
        this.setMessage( this.tournament.name || "Tournament") ;
      }
    },

    //----------------------------------------
    async loadTournamentById( tournamentId ) {
      if (!tournamentId) {
        console.error("Tried to get null tournament");
        debugger
        return;
      }
      if (localMode) {
        this.tournament = Util.loadData("tournament"+ tournamentId) || {};
      } else {
        this.tournament = this.loadTournamentByIdFromDB( tournamentId );
      }
      if (this.tournament) {
        this.setMessage( this.tournament.name || "Tournament") ;
      }
    },


    //----------------------------------------
    // load tournament from 4 letter code that is valid today only, use ID from here on out
    // code should only be ised for ad-hoc tournaments, not ones set up in advance.
    //----------------------------------------
    async loadTournamentByCodeFromDB( tournamentCode ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      // server side will use date and short term code to get the persistent ID
      let date = (new Date()).toLocaleDateString();

      this.loadingData = true;
      try {
        let response = await fetch(serverURL +
                                   "tournaments?code=" + tournamentCode +
                                   "&date=" + date);
        if (!response.ok) { throw await response.json(); }
        let tournament = await response.json();
        return tournament;
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

      this.loadingData = true;
      try {
        let response = await fetch(serverURL + "tournaments?id=" + tournamentId );
        if (!response.ok) { throw await response.json(); }
        let tournament = await response.json();
        return tournament;
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
    // Generate random 4 letter code
    // verify this ID doesn't exist already? TODO
    // This should take place server side to ensure uniqueness
    //----------------------------------------
    generateTournamentId: function() {
      let randomId = "";
      for (let i=0; i<4; i++) {
        randomId += String.fromCharCode(65+this.random(26));
      }
      return randomId;
    },

    //----------------------------------------
    async saveTournament( tournament ) {
      if (!tournament || !tournament.name) {
        return;
      }
      this.setMessage( this.tournament.name );

      // this should take place server-side
      this.tournament.date = (new Date()).toLocaleDateString();

      if (localMode) {
        this.tournament.id = this.generateTournamentId();
        Util.saveData("tournament"+ tournament.id, tournament );
      } else {
        this.saveTournamentToDB( tournament );  // ID created in DB
      }
    },


    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // Should ID be generated remotely? Probably.
    //----------------------------------------
    async saveTournamentToDB( tournament ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return;
      }

      if (!tournament.id) {
        alert("No tournament ID specified. Can't save");
        // or do we let the DB generate the ID? Tournaments are immutable
        return;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( tournament ));
        if (!response.ok) { throw await response.json(); }

        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));
        // no return here because tournament should never be updated only created
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
      }
      finally {
        this.saveInProgress = false;
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
      return this.archers[ archerId ];
      // there is no DB version of this, use loadTournamentArchers instead
    },

    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)a
    // Called only at the beginning of scoring and if there is a versioning error
    //----------------------------------------
    async loadArchers( tournamentId, groupId ) {
      if (localMode) {
        return Util.loadData("archers:"+tournamentId+"-"+groupId);
      } else {
        return this.loadArchersFromDB( tournamentId, groupId );
      }
    },

    async updateArcher( archer ) {
      if (localMode) {
        archer.id = this.nextArcherId++;    // this needs to come from Tournament or DB
        Util.saveData("archers:"+archer.tournamentId+"-"+archer.groupId,
                      this.archers);
      } else {
        // save and update local copy with DB versioning and ID creation (if necessary)
        archer = this.saveArcherToDB( archer ) || archer;
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

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( archer ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks
        // we should have (last updated, version)
        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));

        // return updated object (with versioning data, etc)
        return archer;
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

  },

});
