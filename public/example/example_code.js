const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

let users = [];

app.use(express.json());

app.get("/users", (req, res) => {
  res.send(users);
});

app.post("/users", (req, res) => {
  const u = req.body;
  if (!u.name) {
    res.send("no name");
    return;
  }
  u.id = Math.floor(Math.random() * 10000);
  users.push(u);
  res.send(u);
});

app.get("/user/:id", (req, res) => {
  const id = req.params.id;
  const found = users.filter((u) => u.id == id)[0];
  if (!found) {
    res.send("not found");
  } else {
    res.send(found);
  }
});

app.listen(port, () => {
  console.log("server started on port " + port);
});
