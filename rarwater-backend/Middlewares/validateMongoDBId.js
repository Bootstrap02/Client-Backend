const mongoose = require('mongoose');

// Use as middleware on any route with an :id param, e.g.
//   router.get('/:id', validateMongoDBId, controller.getOne)
const validateMongoDBId = (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid ID' });
  }
  next();
};

module.exports = validateMongoDBId;
