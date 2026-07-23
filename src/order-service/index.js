const { app } = require('./app');

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
