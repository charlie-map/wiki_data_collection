require('dotenv').config({
	path: __dirname + "/.env"
});
const fs = require('fs');

const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const {
	v4: uuidv4
} = require('uuid');
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
app.use(bodyParser.urlencoded({
	extended: false
}));

app.post("/signup_user", (req, res) => {
	// takes in req.body:
	// age, gender, race, education_level
	let user_data = req.body;

	// create a unique_id for the user:
	// this assumes the user will save this uuid on their chrome browser
	let user_unique_id = uuidv4();

	// insert as new user
	connection.query("INSERT INTO user (unique_id, age, gender, race, education_level) VALUES (?, ?, ?, ?, ?)", [user_unique_id, user_data.age_data, user_data.gender_data, user_data.race_data, user_data.institution_level], (err) => {
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
	//console.log(req.body);

	// check if page exists in current data collection
	connection.query("SELECT id FROM page WHERE unique_id=?;", req.body.wiki_code, async (err, page_id) => {
		if (err)
			console.error(err);

		// if it does not, create a new entry in page
		if (!page_id.length)
			await new Promise((resolve, reject) => {
				connection.query("INSERT INTO page (unique_id, page_name, wiki_page) VALUES (?, ?, ?);", [req.body.wiki_code, req.body.page_title, req.body.xml_body], (err) => {
					if (err) return reject(err);

					connection.query("SELECT LAST_INSERT_ID() FROM page;", (err, new_id) => {
						if (err) return reject(err);

						page_id[0] = {}
						page_id[0].id = new_id[0]["LAST_INSERT_ID()"];
						resolve();
					});
				});
			});

		page_id = page_id[0].id;

		// create new view_vote input
		let user_id = await pull_id("user", req.body.unique_id);
		let has_seen = await check_view(user_id, page_id);

		// if user hasn't seen this page, add to view_vote
		// and to user viewed pages
		if (!has_seen) {
			await new Promise((resolve, reject) => {
				connection.query("INSERT INTO view_vote (user_id, page_id) VALUES (?, ?);", [user_id, page_id], (err) => {
					if (err) return reject(err);

					connection.query("UPDATE user SET viewed_page = (SELECT viewed_page FROM user WHERE id=?) + 1;", user_id, (err) => {
						if (err) return reject(err);

						resolve();
					});
				});
			});
		}

		res.end();
	});
});

app.post("/focus_time", async (req, res) => {
	if (!req.body.user_unique_id || !req.body.page_unique_id)
		return res.end();

	// pull ids
	let user_id = await pull_id("user", req.body.user_unique_id);
	let page_id = await pull_id("page", req.body.page_unique_id);

	connection.query("UPDATE view_vote SET focus_time = (SELECT focus_time FROM view_vote WHERE user_id=? AND page_id=?) + ? WHERE user_id=? AND page_id=?", [user_id, page_id, req.body.add_time, user_id, page_id], (err) => {
		if (err) console.error(err);

		res.end();
	});
});

app.post("/vote_page", async (req, res) => {
	if (!req.body.user_unique_id || !req.body.page_unique_id)
		return res.end();

	// pull ids
	let user_id = await pull_id("user", req.body.user_unique_id);
	let page_id = await pull_id("page", req.body.page_unique_id);

	// pull current focus time
	connection.query("SELECT focus_time FROM view_vote WHERE user_id=? AND page_id=?;", [user_id, page_id], (err, focus_time) => {
		if (err) console.error(err);		

		connection.query("UPDATE view_vote SET vote=?, page_vote_time=? WHERE user_id=? AND page_id=?",
			[req.body.level, focus_time[0].focus_time, user_id, page_id], (err) => {
				if (err) console.error(err);

				res.end();
			});
	});
});

https.createServer({
	key: fs.readFileSync("key.pem"),
	cert: fs.readFileSync("cert.pem")
}, app).listen(4224, () => {
	console.log("server go vroom");
});

function pull_id(table, unique_id) {
	return new Promise((resolve, reject) => {
		connection.query("SELECT id FROM " + table + " WHERE unique_id=?;", unique_id, (err, res) => {
			if (err || !res.length) return reject(err);

			resolve(res[0].id);
		});
	});
}

function check_view(user_id, page_id) {
	return new Promise((resolve, reject) => {
		connection.query("SELECT vote FROM view_vote WHERE user_id=? AND page_id=?", [user_id, page_id], (err, res) => {
			if (err) return reject(err);

			resolve(res.length ? 1 : 0);
		});
	});
}