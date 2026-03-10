/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a Sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.27.0'
const migrationName = `${migrationVersion}-add-discovery-override`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * Adds nullable discoveryOverride BOOLEAN column to authors and series tables.
 *
 * @param {MigrationOptions} options
 * @returns {Promise<void>}
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  for (const tableName of ['authors', 'series']) {
    if (await queryInterface.tableExists(tableName)) {
      const tableDescription = await queryInterface.describeTable(tableName)
      if (!tableDescription.discoveryOverride) {
        logger.info(`${loggerPrefix} Adding discoveryOverride column to ${tableName} table`)
        await queryInterface.addColumn(tableName, 'discoveryOverride', {
          type: queryInterface.sequelize.Sequelize.DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: null
        })
        logger.info(`${loggerPrefix} Added discoveryOverride column to ${tableName} table`)
      } else {
        logger.info(`${loggerPrefix} discoveryOverride column already exists in ${tableName} table`)
      }
    } else {
      logger.info(`${loggerPrefix} ${tableName} table does not exist`)
    }
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * Removes the discoveryOverride column from authors and series tables.
 *
 * @param {MigrationOptions} options
 * @returns {Promise<void>}
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  for (const tableName of ['authors', 'series']) {
    if (await queryInterface.tableExists(tableName)) {
      const tableDescription = await queryInterface.describeTable(tableName)
      if (tableDescription.discoveryOverride) {
        logger.info(`${loggerPrefix} Removing discoveryOverride column from ${tableName} table`)
        await queryInterface.removeColumn(tableName, 'discoveryOverride')
        logger.info(`${loggerPrefix} Removed discoveryOverride column from ${tableName} table`)
      }
    }
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
