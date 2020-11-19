var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var session = require("express-session");
var morgan = require("morgan");
const logger = require("./logger");
const fetch = require("node-fetch");
const passport = require("passport");
var User = require("./models/User");
const config = require("./config");

var userProfile;

var app = express();

const google_sheet_url =
  "https://script.google.com/macros/s/AKfycbwu03nmH-r1HSS8ujeSiy6tx5EQFAsimHc8j2VHFLZEpzheN58/exec";

// set our application port
app.set("port", 4000);

// set morgan to log info about our requests for development use.
/* app.use(morgan("dev")); */

/*  PASSPORT Initialization  */

app.use(passport.initialize());
app.use(passport.session());

app.get("/error", (req, res) => res.send("error logging in"));
app.get("/success", (req, res) => {
  console.log("instide");
  return;
});

passport.serializeUser(function (user, cb) {
  cb(null, user);
});

passport.deserializeUser(function (obj, cb) {
  cb(null, obj);
});

/*  Google AUTH  */

const GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
const GOOGLE_CLIENT_ID =
  "google client id here";
const GOOGLE_CLIENT_SECRET = "google client secret goes here";
passport.use(
  new GoogleStrategy(
    {
      clientSecret: GOOGLE_CLIENT_SECRET,
      clientID: GOOGLE_CLIENT_ID,
      callbackURL: config.googleAuth.callbackURL,
    },
    function (accessToken, refreshToken, profile, done) {
      userProfile = profile;
      return done(null, userProfile);
    }
  )
);

/* FACEBOOK AUTH */

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

const FacebookStrategy = require("passport-facebook").Strategy;
passport.use(
  new FacebookStrategy(
    {
      clientID: config.facebookAuth.clientID,
      clientSecret: config.facebookAuth.clientSecret,
      callbackURL: config.facebookAuth.callbackURL,
    },
    function (accessToken, refreshToken, profile, done) {
      userProfile = profile;
      return done(null, profile);
    }
  )
);

app.get(
  "/auth/facebook",
  passport.authenticate("facebook", {
    scope: ["public_profile", "email"],
  })
);

// Setting up a dedicated logger && saving to a file un the folder log
app.use(morgan("tiny", { stream: logger.stream }));

// initialize body-parser to parse incoming parameters requests to req.body
app.use(bodyParser.urlencoded({ extended: true }));

// initialize cookie-parser to allow us access the cookies stored in the browser.
app.use(cookieParser());

// initialize express-session to allow us track the logged-in user across sessions.
app.use(
  session({
    key: "user_sid",
    secret: "somerandonstuffs",
    resave: false,
    saveUninitialized: false,
    cookie: {
      expires: 600000,
    },
  })
);

// This middleware will check if user's cookie is still saved in browser and user is not set, then automatically log the user out.
app.use((req, res, next) => {
  if (req.cookies.user_sid && !req.session.user) {
    res.clearCookie("user_sid");
  }
  next();
});

// middleware function to check for logged-in users
var sessionChecker = (req, res, next) => {
  if (req.session.user && req.cookies.user_sid) {
    res.redirect("/dashboard");
  } else {
    next();
  }
};

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/error" }),
  async function (req, res) {
    // Successful authentication, redirect success.
    console.log("success");
    // console.log(userProfile);
    let username = userProfile.emails[0].value.split("@")[0];
    let email = userProfile.emails[0].value;

    try {
      var user = await User.findOne({ username: username }).exec();
      console.log("found", user);
      if (!user) {
        var user = new User({
          username: username,
          email: email,
        });
        user.save((err, docs) => {
          if (err) {
            res.redirect("/signup");
          } else {
            console.log(docs);
            req.session.user = docs;
            savetoSheets(username, email);
            req.session.user = docs;
            res.redirect("/dashboard");
          }
        });
      } else {
        req.session.user = user;
        res.redirect("/dashboard");
      }
    } catch (error) {
      console.log(error);
    }
  }
);

app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: "/error",
  }),
  async function (req, res) {
    console.log("succcess");
    console.log(userProfile);

    if (userProfile.emails[0].value === undefined) {
      res.send("No verified email with this facebook account");
      return;
    }

    let username = userProfile.emails[0].value.split("@")[0];
    let email = userProfile.emails[0].value;

    try {
      var user = await User.findOne({ username: username }).exec();
      console.log("found", user);
      if (!user) {
        var user = new User({
          username: username,
          email: email,
        });
        user.save((err, docs) => {
          if (err) {
            res.redirect("/signup");
          } else {
            console.log(docs);
            req.session.user = docs;
            savetoSheets(username, email);
            req.session.user = docs;
            res.redirect("/dashboard");
          }
        });
      } else {
        req.session.user = user;
        res.redirect("/dashboard");
      }
    } catch (error) {
      console.log(error);
    }
  }
);

const savetoSheets = (username, email) => {
  // Google Sheet
  const url = `${google_sheet_url}?Username=${encodeURIComponent(
    username
  )}&Email=${encodeURIComponent(email)}`;

  fetch(url)
    .then((res) => res.json())
    .then((res) => {
      console.log("google sheet res", { res });
    })
    .catch((e) => {
      console.error(e);
      return;
    });
};

// route for Home-Page
app.get("/", sessionChecker, (req, res) => {
  res.redirect("/login");
});

// route for user signup
app
  .route("/signup")
  .get(sessionChecker, (req, res) => {
    res.sendFile(__dirname + "/public/signup.html");
  })
  .post((req, res) => {
    var user = new User({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
    });
    user.save((err, docs) => {
      if (err) {
        res.redirect("/signup");
      } else {
        console.log(docs);
        req.session.user = docs;

        const { username, email } = req.body;

        savetoSheets(username, email);
      }
      res.redirect("/dashboard");
    });
  });

// route for user Login
app
  .route("/login")
  .get(sessionChecker, (req, res) => {
    res.sendFile(__dirname + "/public/login.html");
  })
  .post(async (req, res) => {
    var username = req.body.username,
      password = req.body.password;

    try {
      var user = await User.findOne({ username: username }).exec();
      if (!user) {
        res.redirect("/login");
      }
      user.comparePassword(password, (error, match) => {
        if (!match) {
          res.redirect("/login");
        }
      });
      req.session.user = user;
      res.redirect("/dashboard");
    } catch (error) {
      console.log(error);
    }
  });

// route for user's dashboard
app.get("/dashboard", (req, res) => {
  if (req.session.user && req.cookies.user_sid) {
    res.sendFile(__dirname + "/public/dashboard.html");
  } else {
    res.redirect("/login");
  }
});

// route for user logout
app.get("/logout", (req, res) => {
  if (req.session.user && req.cookies.user_sid) {
    res.clearCookie("user_sid");
    // res.redirect("/");
    res.session = null;
    res.redirect("/");
  } else {
    res.redirect("/login");
  }
});

// route for handling 404 requests(unavailable routes)
app.use(function (req, res, next) {
  res.status(404).send("Sorry can't find that!");
});

// start the express server
app.listen(app.get("port"), () =>
  console.log(`App started on port ${app.get("port")}`)
);
