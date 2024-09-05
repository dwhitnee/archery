/*global fetch, Vue, VueRouter, Util */
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
// archer list should be kept in a cookie
// archer data should be in cloud (how to uniquely ID?)
// Create v Edit Tournament?
// archer ID is name?  How to avoid dupes at creation? Steal other archer?
//  Enforce each archer on unique phone? Steal vs overwrite?

//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 app for entering and viewing archery tournament results
//
/*  Data model example

    tournament {
      id: "XYZ",   // PK (how to enforce this unique each day?
      date: 1/1/2024,  // RK (PK could be duplicated someday I guess?)
      description: "Peanut Farmer 1000",
      type: { "WA 300", ends: 10, arrows: 3, rounds: 1 }
      //  archers: [id, id, id, ...]
      //  bales: { name: "14", archers: [...] }

    archerTournament: {
      tournamentId: "XYZ",   // PK
      archer: {
        id: "bradyellison",    // RK
        name: "Brandy Allison",
        bow: "FSLR",
        ageGender: "AM",
      }
      scoringGroup: "14",    // bale? could be two bales  // RK?
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
    archers: [],  // on a particular bale (or all archers in the tournament?

    newGroupName: "",  // temp for data entry
    groupName: "",

    newArcher: {},
    nextArcherId: 0,

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

    let id = this.$route.query.id;
    if (id) {
      await this.loadTournament( id );
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

    inProgress: function() {
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

    //----------------------------------------
    async editArrowsXXX( event, index ) {
      if (this.coachView) { this.endEdit(); return; }

      this.handleArrowUpdate();

      // SAVE TO DB (cloud or local)
      await this.updateArcherArrows();

      this.endEdit();
    },


    selectArcher: function( archer ) {
      console.log("Here we go! " + archer.name);
      // open a scoring page for this archer
    },

    // this list should be kept in a cookie
    // archer data should be in cloud
    addNewArcher: function( event ) {
      this.newArcher.id = this.nextArcherId++;
      this.archers.push( this.newArcher );
      // TODO: add to list of archers on this bale in local storage
      // TODO: add archer to tournament DB

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
    async loadTournament( tournamentId ) {
      if (!tournamentId) {
        console.error("Tried to get null tournament");
        debugger
        return;
      }
      if (localMode) {
        this.tournament = Util.loadData("tournament"+ tournamentId) || {};
      } else {
        this.loadTournamentFromDB( tournamentId );
      }
      if (this.tournament) {
        this.setMessage( this.tournament.name || "Tournament") ;
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
      this.tournament.id = this.generateTournamentId();

      if (localMode) {
        Util.saveData("tournament"+ tournament.id, tournament );
      } else {
        this.saveTournamentToDB( tournament );
      }
    },



    //----------------------------------------
    //----------------------------------------
    // Archer scorecard persistence
    //----------------------------------------
    async getArcher( tournamentId, archerId ) {
      if (localMode) {
        return Util.loadData("archer"+archerId+":"+tournamentId);
      } else {
        return this.loadArcherFromDB( tournamentId, archerId );
      }
    },

    async updateArcher( archer ) {
      if (localMode) {
        Util.saveData("archer"+archer.id+":"+archer.tournamentId);
      } else {
        this.saveArcherToDB( archer );
      }
    },




    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // Should ID be generated remotely? Probably.
    //----------------------------------------
    async saveTournamentToDB( tournament ) {
      if (this.loadingData) {
        return;  // don't allow updates while still loading from DB
      }

      if (!tournament.id) {
        alert("No tournament ID specified. Can't save");
        // or do we let the DB generate the ID? Tournaments are immutable
        return;
      }

      if (this.saveInProgress) { return; }

      try {
        this.saveInProgress = true;
        let postData = tournament;

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)
        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));
        // only need this for versioning or DB generated ID.  hmmm  FIXME
        // if (result.id) {
        //   this.tournament = result;
        // }
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
      }

      this.saveInProgress = false;
    },



    //----------------------------------------
    // load all names
    //----------------------------------------
    async loadTournamentsIGuess( tournamentId ) {
      try {
        let response = await fetch(serverURL + "tournament?id" + tournamentId );
        if (!response.ok) { throw await response.json(); }
        this.tournament = await response.json();

        if (response.id) {
          this.tournament = response;
        }
      }
      catch (err) {
        console.error( err );
      }
    },

  },

});
