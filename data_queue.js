const express = require('express');
const bodyParser = require('body-parser');
const { uuid } = require('uuidv4');
const mysql = require('mysql2');

const connection = mysql.createConnection({
	host: process.env.HOST,
    database: process.env.DATABASE,
    user: process.env.WIKI_USER,
    password: process.env.PASSWORD,
    insecureAuth: false
});

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.post("/signup_user", (req, res) => {
	// takes in req.body:
	// age, gender, race, education_level
	let user_data = req.body;

	// create a unique_id for the user:
	// this assumes the user will save this uuid on their chrome browser
	let user_unique_id = uuid();

	// insert as new user
	connection.query("INSERT INTO user (unique_id, age, gender, race, education_level) VALUES (?, ?, ?, ?, ?)",
		[user_unique_id, user_data.age, user_data.gender, user_data.race, user_data.education_level], (err) => {
			if (err)
				console.error(err);

			res.end(user_unique_id);
		});
});

app.get("/pull_view_data", (res, res) => {
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

app.post("/send_data", (req, res) => {
	// receive data about a specific page from the user

	console.log(req.body);
});

app.listen(4224, () => {
	console.log("server go vroom");
});