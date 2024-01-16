/*jslint node: true, esversion: 6 */
//----------------------------------------------------------------------
// All stuff related to responding to the HTTP Request
//----------------------------------------------------------------------

// HTTP response for a successful call
let successResponse = {
  body: "RESPONSE GOES HERE - REPLACE ME",
  statusCode: 200,
  headers: {  // Allow any web page to call us (CORS support)
    "Access-Control-Allow-Origin": "*"
    // Access-Control-Allow-Credentials': true // only for auth/cookies
  }
};

// There is a bug/"feauture" in API Gateway that swallows these errors
let errorResponse = {
  error: { messageString: "huh? ATTACH REAL ERROR HERE" },
  messageString: "Doh! There was an error in the request OR MAYBE HERE"
};

//----------------------------------------------------------------------
// Take this data and shove it, back to the AWS user who requested it.
//----------------------------------------------------------------------
function respondWithSuccess( data, callback ) {
  let response = successResponse;
  response.body = JSON.stringify( data );  // prettify for transit
  console.log("Successful Response: " + response.body );
  callback( null, response );
}


module.exports = {
  //----------------------------------------
  // check for required params, abort if not there
  //----------------------------------------
  verifyParam: function( request, callback, param ) {
    let query = request.queryStringParameters;   // GET

    if (!query) {    // POST
      try {
        query = JSON.parse( request.body );
      } catch (e) {
        console.error( e.message + ":'" + request.body +"'" );
      }
    }

    // 0 is a valid param so can't do !query[param]
    if (!query || (param && (query[param]) === undefined)) {
      let errorMsg = "bad request/missing param: " + param;
      console.error( errorMsg );
      console.error( JSON.stringify( request ));

      // attach error message to response? I think it's just a 400 error
      callback( null, errorResponse );
      return false;
    }
    return true;
  },

  //----------------------------------------------------------------------
  // AWS response boilerplate - 200, CORS, etc...
  //----------------------------------------------------------------------
  respond: function( err, data, callback ) {
    if (err) {
      console.error("FAIL: " + err );
      callback( err );
    } else {
      respondWithSuccess( data, callback );
    }
  }
};
