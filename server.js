// server.js
const express = require("express");
const pool = require("./database.js");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 3000;

const app = express();

app.use(cors({ origin: "http://localhost:8080", credentials: true }));
// We need to include "credentials: true" to allow cookies to be represented
// Also "credentials: 'include'" need to be added in Fetch API in the Vue.js App

// The express.json() function is a built-in middleware function in Express.
// It parses incoming requests with JSON payloads and is based on body-parser.
app.use(express.json());
app.use(cookieParser()); // Parse Cookie header and populate req.cookies with an object keyed by the cookie names.

const secret = "gdgdhdbcb770785rgdzqws"; // use a stronger secret
const maxAge = 60 * 60; //jwt token lasts 1hour, jwt token is calculated by seconds not milliseconds

const generateJWT = (id) => {
  return jwt.sign({ id }, secret, { expiresIn: maxAge });
  //jwt.sign(payload, secret, [options, callback]), and it returns the JWT as string
};

// is used to check whether a user is authinticated
app.get("/auth/authenticate", async (req, res) => {
  console.log("authentication request has been arrived");
  const token = req.cookies.jwt; // assign the token named jwt to the token const
  let authenticated = false; // a user is not authenticated until proven the opposite
  try {
    if (token) {
      //checks if the token exists
      //jwt.verify(token, secretOrPublicKey, [options, callback]) verify a token
      await jwt.verify(token, secret, (err) => {
        //token exists, now we try to verify it
        if (err) {
          // not verified, redirect to login page
          console.log(err.message);
          console.log("token is not verified");
          res.send({ authenticated: authenticated }); // authenticated = false
        } else {
          // token exists and it is verified
          console.log("author is authinticated");
          authenticated = true;
          res.send({ authenticated: authenticated }); // authenticated = true
        }
      });
    } else {
      //applies when the token does not exist
      console.log("author is not authinticated");
      res.send({ authenticated: authenticated }); // authenticated = false
    }
  } catch (err) {
    console.error(err.message);
    res.status(400).send(err.message);
  }
});

// signup a user
app.post("/auth/signup", async (req, res) => {
  try {
    console.log("a signup request has arrived");
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    // optional: check if user exists first
    const existing = await pool.query("SELECT 1 FROM users WHERE email=$1", [
      email,
    ]);
    if (existing.rows.length) {
      return res.status(400).json({ error: "email already registered" });
    }

    const salt = await bcrypt.genSalt();
    const bcryptPassword = await bcrypt.hash(password, salt);

    const authUser = await pool.query(
      "INSERT INTO users(email, password) values ($1, $2) RETURNING *",
      [email, bcryptPassword]
    );

    const token = generateJWT(authUser.rows[0].id);

    return res.status(201).json({ user_id: authUser.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    console.log("a login request has arrived");
    const { email, password } = req.body;
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (user.rows.length === 0)
      return res.status(401).json({ error: "User is not registered" });

    /* 
        To authenticate users, you will need to compare the password they provide with the one in the database. 
        bcrypt.compare() accepts the plain text password and the hash that you stored, along with a callback function. 
        That callback supplies an object containing any errors that occurred, and the overall result from the comparison. 
        If the password matches the hash, the result is true.

        bcrypt.compare method takes the first argument as a plain text and the second argument as a hash password. 
        If both are equal then it returns true else returns false.
        */

    //Checking if the password is correct
    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    //console.log("validPassword:" + validPassword);
    if (!validPassword)
      return res.status(401).json({ error: "Incorrect password" });

    const token = await generateJWT(user.rows[0].id);
    res
      .status(201)
      .cookie("jwt", token, { maxAge: maxAge * 1000, httpOnly: true }) // cookie lasts 1hour, same as jwt
      .json({ user_id: user.rows[0].id });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

//logout a user = deletes the jwt
app.get("/auth/logout", (req, res) => {
  console.log("delete jwt request arrived");
  res.status(202).clearCookie("jwt").json({ Msg: "cookie cleared" });
});

app.post("/api/posts", async (req, res) => {
  try {
    console.log("a post request has arrived");
    const post = req.body;
    const newpost = await pool.query(
      "INSERT INTO posttable(body) values ($1) RETURNING*",
      [post.body]
    );
    res.json(newpost);
  } catch (err) {
    console.error(err.message);
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    console.log("get posts request has arrived");
    const posts = await pool.query(
      "SELECT * FROM posttable ORDER BY created_at DESC"
    );
    res.json(posts.rows);
  } catch (err) {
    console.error(err.message);
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    console.log("get a post with route parameter  request has arrived");
    // The req.params property is an object containing properties mapped to the named route "parameters".
    // For example, if you have the route /posts/:id, then the "id" property is available as req.params.id.
    const { id } = req.params; // assigning all route "parameters" to the id "object"
    const posts = await pool.query(
      // pool.query runs a single query on the database.
      //$1 is mapped to the first element of { id } (which is just the value of id).
      "SELECT * FROM posttable WHERE id = $1",
      [id]
    );

    if (posts.rows.length == 0) {
      return res.status(404).json({ error: "Post wasn't found" });
    }
    res.json(posts.rows[0]);
    // we already know that the row array contains a single element, and here we are trying to access it
    // The res.json() function sends a JSON response.
    // This method sends a response (with the correct content-type) that is the parameter converted to a JSON string using the JSON.stringify() method.
  } catch (err) {
    console.error(err.message);
  }
});
// put method to update a post
app.put("/api/posts/:id", async (req, res) => {
  try {
    console.log("update post request arrived");

    const { id } = req.params;
    const { body } = req.body;

    const updated = await pool.query(
      "UPDATE posttable SET body = $1 WHERE id = $2 RETURNING *",
      [body, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});
//Delete all
app.delete("/api/posts", async (req, res) => {
  try {
    console.log("delete all posts request has arrived");
    const deletePosts = await pool.query("DELETE FROM posttable");
    res.json(deletePosts);
  } catch (err) {
    console.error(err.message);
  }
});
//Delete by ID
app.delete("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      "DELETE FROM posttable WHERE id = $1",
      [id]
    );

    res.status(204).end(); // success, no content
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});


app.listen(port, () => {
  console.log("Server is listening to port " + port);
});
