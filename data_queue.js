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
app.use(bodyParser.json({
	limit: "50mb"
}));
app.use(bodyParser.urlencoded({
	extended: false,
	limit: "50mb",
	parameterLimit: 50000
}));

app.set("views", __dirname + "/views");

/* ERROR MIDDLEWARE */
app.use(function(err, req, res, next) {
	console.error(err.stack);
	res.status(500).send("Something broke!");
});

app.get("/privacy-policy", (req, res) => {
	res.sendFile(__dirname + "/views/privacy.html");
});

app.post("/signup_user", (req, res, next) => {
	// takes in req.body:
	// age, gender, race, education_level
	let user_data = req.body;

	// create a unique_id for the user:
	// this assumes the user will save this uuid on their chrome browser
	let user_unique_id = uuidv4();

	// insert as new user
	connection.query("INSERT INTO user (unique_id, age, gender, race, education_level) VALUES (?, ?, ?, ?, ?)", [user_unique_id, user_data.age_data, user_data.gender_data, user_data.race_data, user_data.institution_level], (err) => {
		if (err) return next(err);

		res.end(user_unique_id);
	});
});

app.post("/change_user_data", async (req, res, next) => {
	if (!req.body.user_unique_id)
		return next("no unique id");

	let user_id = await pull_id("user", req.body.user_unique_id);

	connection.query("UPDATE user SET age=?, gender=?, race=?, education_level=? WHERE id=?",
		[req.body.age_data, req.body.gender_data, req.body.race_data, req.body.institution_level, user_id], (err) => {
			if (err) return next(err);

			res.end();
		});
});

app.post("/pull_view_data", (req, res, next) => {
	// expects user_unique_id in req.body
	let user_unique_id = req.body.user_unique_id;
	if (!user_unique_id)
		return next("no unique id");

	connection.query("SELECT viewed_page, voted_page, SUM(view_vote.focus_time) AS total_time FROM user INNER JOIN view_vote ON user.id=view_vote.user_id WHERE user.unique_id=?;", user_unique_id, (err, result) => {
		if (err || !result.length) return next(err);

		// check for null (no pages visited yet)
		let check_keys = Object.keys(result[0]);
		for (let check_res = 0; check_res < 3; check_res++) {
			if (result[0][check_keys[check_res]] == null) {
				result[0][check_keys[check_res]] = 0;
			}
		}

		result[0].total_time = result[0].total_time.toFixed(result[0].total_time > 1000 ? 2 : 3);

		res.json(result);
	});
});

app.post("/open_page", (req, res, next) => {
	// receive data about a specific page from the user

	// check if page exists in current data collection
	connection.query("SELECT id FROM page WHERE unique_id=?;", req.body.wiki_code, async (err, page_id) => {
		if (err) return next(err);

		try {
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

		} catch (error) {
			return next(error);
		}

		res.end();
	});
});

app.post("/focus_time", async (req, res, next) => {
	if (!req.body.user_unique_id || !req.body.page_unique_id)
		return next("no unique id");

	// pull ids
	let user_id, page_id;
	try {
		user_id = await pull_id("user", req.body.user_unique_id);
		page_id = await pull_id("page", req.body.page_unique_id);
	} catch (error) {
		return next(error);
	}

	// calculate as hours
	req.body.add_time /= 3600;

	connection.query("UPDATE view_vote SET focus_time = (SELECT focus_time FROM view_vote WHERE user_id=? AND page_id=?) + ? WHERE user_id=? AND page_id=?", [user_id, page_id, req.body.add_time, user_id, page_id], (err) => {
		if (err) return next(err);

		res.end();
	});
});

app.post("/vote_page", async (req, res, next) => {
	if (!req.body.user_unique_id || !req.body.page_unique_id)
		return next("no unique id");

	// pull ids
	let user_id, page_id;
	try {
		user_id = await pull_id("user", req.body.user_unique_id);
		page_id = await pull_id("page", req.body.page_unique_id);
	} catch (error) {
		return next(error);
	}

	// pull current focus time
	connection.query("SELECT vote, focus_time FROM view_vote WHERE user_id=? AND page_id=?;", [user_id, page_id], (err, focus_time) => {
		if (err || !focus_time.length) return next(err);

		let pre_new_vote = focus_time[0].vote;

		connection.query("UPDATE view_vote SET vote=?, page_vote_time=? WHERE user_id=? AND page_id=?", [req.body.level, focus_time[0].focus_time, user_id, page_id], (err) => {
			if (err) return next(err);

			// update user voted_count
			connection.query("UPDATE user SET voted_page=(SELECT voted_page FROM user WHERE id=?) + ? WHERE id=?", [user_id, pre_new_vote == 0, user_id], (err) => {
				if (err) return next(err);

				res.end();
			});
		});
	});
});

function isPermissioned(req, res, next) {
	let query_name = req.query.name;
	let query_pass_code = req.query.passcode;

	connection.query("SELECT string_value FROM settings WHERE name=?", query_name, (err, result) => {
		if (err || !result.length) return res.end();

		// check code match
		if (query_pass_code != result[0].string_value)
			return res.end();

		next();
	});
}

app.get("/pull_page_names", isPermissioned, (req, res, next) => {
	connection.query("SELECT unique_id FROM page WHERE LENGTH(wiki_page) > 0;", (err, unique_id) => {
		if (err) return next(err);

		res.json(unique_id);
	});
});

/* backend pull xml files */
app.post("/pull_data", isPermissioned, async (req, res, next) => {
	/* assumes a req.body.unique_id that has the pattern:
		[
			{unique_id: "Unique id of page1"},
			{unique_id: "Unique id of page2"}
		]
	*/
	if (!req.body.unique_id || !req.body.unique_id.length)
		return next("No pages");

	req.body.unique_id = JSON.parse(req.body.unique_id);

	let return_val = [];

	let pull_pages = req.body.unique_id.map((name) => {
		return new Promise((resolve, reject) => {
			connection.query("SELECT id, page_name, wiki_page FROM page WHERE unique_id=?", name.unique_id, (err, page) => {
				if (err) return reject(err);

				return_val.push(`<id>${page[0].id}</id>\n<title>${page[0].page_name}</title>\n${page[0].wiki_page}`);

				resolve();
			});
		});
	});

	await Promise.all(pull_pages);

	res.end(JSON.stringify(return_val));
});

app.listen(8822, () => {
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