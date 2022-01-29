require('dotenv').config({
	path: __dirname + "/.env"
});
const fs = require('fs');

const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2');

const connection = mysql.createConnection({
	host: process.env.HOST,
    database: process.env.DATABASE,
    user: process.env.WIKI_USER,
    password: process.env.PASSWORD,
    insecureAuth: false
});

const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/signup_user", (req, res) => {
	// takes in req.body:
	// age, gender, race, education_level
	let user_data = req.body;

	// create a unique_id for the user:
	// this assumes the user will save this uuid on their chrome browser
	let user_unique_id = uuidv4();

	// insert as new user
	connection.query("INSERT INTO user (unique_id, age, gender, race, education_level) VALUES (?, ?, ?, ?, ?)",
		[user_unique_id, user_data.age_data, user_data.gender_data, user_data.race_data, user_data.institution_level], (err) => {
			if (err) {
				console.error(err);
				return "";
			}

			res.end(user_unique_id);
		});
});

app.post("/pull_view_data", (req, res) => {
	// expects user_unique_id in req.body
	let user_unique_id = req.body.user_unique_id;
	if (!user_unique_id)
		return res.end();

	connection.query("SELECT viewed_page, voted_page FROM user WHERE unique_id=?;", user_unique_id, (err, result) => {
		if (err)
			console.error(err);

		res.json(result);
	});
});

app.post("/open_page", (req, res) => {
	// receive data about a specific page from the user

	console.log(req.body);
});

app.post("/vote_page", (req, res) => {

});

https.createServer({
	key: fs.readFileSync("key.pem"),
	cert: fs.readFileSync("cert.pem")
}, app).listen(4224, () => {
	console.log("server go vroom");
});