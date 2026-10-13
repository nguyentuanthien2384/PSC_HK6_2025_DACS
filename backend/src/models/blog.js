'use strict';
const {
    Model
} = require('sequelize');
const { versionedImageHooks } = require('../utils/productImage');
module.exports = (sequelize, DataTypes) => {
    class Blog extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            Blog.belongsTo(models.Allcode, { foreignKey: 'subjectId', targetKey: 'code', as: 'subjectData' })
        }
    };
    Blog.init({
        shortdescription: DataTypes.TEXT('long'),
        title: DataTypes.STRING,
        subjectId: DataTypes.STRING,
        statusId: DataTypes.STRING,
        image: DataTypes.BLOB('long'),
        imageVersion: { type: DataTypes.STRING(64), allowNull: true },
        contentMarkdown: DataTypes.TEXT('long'),
        contentHTML: DataTypes.TEXT('long'),
        userId:DataTypes.INTEGER,
        view:DataTypes.INTEGER
    }, {
        sequelize,
        modelName: 'Blog',
        hooks: versionedImageHooks(),
    });
    return Blog;
};
