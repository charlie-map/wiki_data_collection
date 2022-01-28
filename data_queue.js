const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.get("/send_data", (req, res) => {
	console.log(req.body);
});

app.listen(4224, () => {
	console.log("server go vroom");
});