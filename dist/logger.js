const winston = require('winston');
require('express-async-errors');

const alignColorsAndTime = winston.format.combine(
  winston.format.colorize({
    all:true
  }),
  winston.format.label({
    label:'[logger]'
  }),
  winston.format.timestamp({
    format:"YY-MM-DD HH:MM:SS"
  }),
  winston.format.printf(
    info => `${info.label}  ${info.timestamp}  ${info.level} : ${info.message}`
  )
);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), alignColorsAndTime),
      colorize: true,
      prettyPrint: true,
      level: 'info'
    }),
    new winston.transports.File({ filename: 'resource.log', level: 'info' }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'exceptions.log' }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), alignColorsAndTime),
      colorize: true,
      prettyPrint: true,
    }),
  ]
});

exports.Logger = logger;
exports.logger = logger;
