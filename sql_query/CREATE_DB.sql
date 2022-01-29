DROP DATABASE IF EXISTS wiki_data;

CREATE DATABASE wiki_data;
USE wiki_data;

/*
	MAKE SURE YOU CREATE A USER:

	CREATE USER "name_of_user"@"localhost" IDENTIFIED BY "password";

	GRANT SELECT, UPDATE, INSERT ON wiki_data.* TO "name_of_user"@"localhost";
	FLUSH PRIVILEGES;
*/

CREATE TABLE user (
	id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
	unique_id VARCHAR(36) NOT NULL,
	age INT NOT NULL,
	gender VARCHAR(32),
	race VARCHAR(64),
	education_level INT,

	viewed_page INT DEFAULT 0,
	voted_page INT DEFAULT 0
);

CREATE TABLE page (
	id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
	unique_id VARCHAR(20) NOT NULL,
	page_name VARCHAR(512) NOT NULL,
	wiki_page TEXT
);

CREATE TABLE view_vote (
	user_id INT NOT NULL,
	page_id INT NOT NULL,

	vote INT,

	page_open DATETIME,
	page_vote DATETIME,
	focus_time BIGINT
);