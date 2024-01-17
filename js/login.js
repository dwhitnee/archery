/*global fetch, Vue, VueRouter, Util, VueApexCharts */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2024, David Whitney
//-----------------------------------------------------------------------

//----------------------------------------------------------------------
//  OAuth for Google. Some magic JS to invoke Google Login and Authentication
//
// Setting up OAuth cliebt for Google:
//   https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
//   https://console.cloud.google.com/apis/credentials
//
//  Google will callback and populate the global "user" object here
//   https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions

// Google OAuth HTML to call handleGoogleLogin()
//  https://developers.google.com/identity/gsi/web/tools/configurator

/*
  <script src="https://accounts.google.com/gsi/client" async></script>

  <div id="g_id_onload"
     data-client_id="1021363791635-7p4g4ltun01jq4o0lirgk8vfhgm46ejp.apps.googleusercontent.com"
     data-context="signin"
     data-ux_mode="popup"
     data-callback="handleGoogleLogin"
     data-login_uri="http://localhost:8080/~dwhitney/archeryTimer/arrowCount.html"
     data-auto_select="true"
     data-itp_support="true">
  </div>

  <div class="g_id_signin"
    data-type="standard"
    data-shape="pill"
    data-theme="outline"
    data-text="signin_with"
    data-size="large"
    data-logo_alignment="left">
  </div>
*/
//----------------------------------------------------------------------

let user = {};

//----------------------------------------
// decode base64 JSON Web Token
//----------------------------------------
function decodeJwt(token) {
  try {
    let payload = atob( token.split('.')[1]);
    return JSON.parse( payload );
  }
  catch (err) {
    console.error("Error parsing OAUth base64 JWT token:" + err );
  }
}

//----------------------------------------
// OAuth ahoy! Called by Google login to populate userinfo
//
//  https://console.cloud.google.com/apis/credentials
//  https://developers.google.com/identity/gsi/web/guides/handle-credential-responses-js-functions
//  https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo
//----------------------------------------
function handleGoogleLogin( response ) {
  const credential = decodeJwt( response.credential );

  console.log("Auth Cred: " +  JSON.stringify( credential ));

  // parse out the good stuff. God this was painful to find (see #obtainuserinfo)
  user = {
    id:          credential.sub,  // The only truly unique ID google provides (Whytf is it called "sub"?)
    name:        credential.name,
    given_name:  credential.given_name,
    family_name: credential.family_name,
    email:       credential.email,
    pictureUrl:  credential.picture,
    auth: "google"
  };

  // let Vue know about globals
  // https://nathanaelmcmillan.com/blog/how-to-watch-global-variables-in-vue-js/
  Vue.set( Vue.prototype, '$globalUser', user );


  // Not needed, but here for reference
  let googleOAuthClient = {
    "web":{
      "client_id":"1021363791635-7p4g4ltun01jq4o0lirgk8vfhgm46ejp.apps.googleusercontent.com",
      "project_id":"test-1494458735954",
      "auth_uri":"https://accounts.google.com/o/oauth2/auth",
      "token_uri":"https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs",
      "client_secret":"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",
      "redirect_uris":["https://dwhitnee.github.io/archeryTimer/arrowCount.html",
                       "https://tolocalhost.com/~dwhitney/archeryTimer/arrowCount.html"],
      "javascript_origins":["https://dwhitnee.github.io","http://localhost:8080"]}
  };
}
