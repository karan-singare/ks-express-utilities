const { Response, BadRequestResponse } = require('./response');
const { isValidObjectId } = require('../lib/object-id');
const ObjectId = require('mongoose').Types.ObjectId;
const { logger } = require('../init/logger');
const axios = require('axios');

/**
 * @class
 * @description - class for CRUD operations using mongoose
 */
class Resource {
  schema;
  validator;
  resourceName;
  schemaObj;
  appId;

  /**
   * @constructor
   * @param {object} schema - schema of the resource for CRUD
   * @param {string | null} resourceAuthId - appId for the resource
   * @param {function} validator - validator for the schema
   */
  constructor(schema, resourceAuthId = null, validator = Resource.defaultValidator) {
    this.schema = schema;
    this.validator = validator;
    this.appId = resourceAuthId;
    this.resourceName = this.schema.name.toLowerCase();
    this.schemaObj = this.schema.schema.obj;
  }

  /**
   * @description - method to create document
   * @param {object} payload - the object containing data to be saved
   */
  async create(payload) {
    console.log(payload);
    return this.save(payload);
  }

  /**
   * @description - get all the items for the resource
   */
  async getAll() {
    return new Promise((resolve) => {
      this.schema
        .find(
          {
            status: { $in: [0, 1] },
            appId: this.appId
          }
        )
        .then((items) => {
          resolve(new Response(200, 'success', items));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });

  }

  /**
   * @description - method to get resource by id
   * @param {string} id - id of the resource
   */
  async getById(id) {
    return this.getByFilter({
      _id: id,
      status: { $in: [0, 1] }
    });
  }

  /**
   * @description - method to update document
   * @param {string} id - id of the resource
   * @param {object} payload - the object containing data to be saved
   */
  async update(payload, id) {
    return this.save(payload, id);
  }

  /**
   * @description - method to update document
   * @param {object} filter - filter for bulk update
   * @param {object} payload - the object containing data to be saved
   */
  async updateMany(filter, payload) {
    return this.save(payload, id);
  }

  /**
   * @description - method to create and save item in database
   * @param {string} id - id of the resource
   * @param {boolean} hard - true if hard delete is needed
   */
  async delete(id, hard = false) {
    if (!hard) {
      await this.schema.updateOne({ _id: id }, { $set: { deletedRoot: true } });
      const status = await this.changeStatus(id, 2);
      return new Response(201, Resource.getSuccessMessage(status))
    } else {
      return new Promise((resolve) => {
        this.schema.findOneAndDelete({ _id: id })
          .then((item) => {
            resolve(new Response(200, 'deleted', item));
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    }
  }
  /**
   * @description - method to create and save item in database
   * @param {string} id - id of the resource
   */
  async activate(id) {
    return this.changeStatus(id, 1);
  }

  /**
   * @description - method to create and save item in database
   * @param {string} id - id of the resource
   */
  async deactivate(id) {
    return this.changeStatus(id, 0);
  }

  /**
   * @description - method to get resource by filters
   * @param {object} filter - object containing filters for getting document
   */
  async getByFilter(filter) {

    return new Promise((resolve) => {
      this.schema.findOne(filter)
        .then((item) => {
          resolve(new Response(200, 'success', item));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }

  /**
   * @description - method to get list of documents based on some filters
   * @param {object} filter - object containing filters for getting document
   * @param {number} pageSize - no. of items per page
   * @param {number} pageNum - page no.
   * @param {object} sortFilter - sorting criteria.
   */
  async getAllByFilter(filter, pageSize, pageNum, sortFilter) {
    return new Promise((resolve) => {
      this.schema
        .find({
          status: { $in: [0, 1] },
          appId: this.appId,
          ...filter
        })
        .skip(pageNum * pageSize)
        .limit(pageSize)
        .sort(sortFilter)
        .then((items) => {
          resolve(new Response(200, 'success', items));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });

    });
  }

  /**
   * @description - method to get list of documents based on some filters
   * @param {array} ids - array of ids for which resources are needed
   * @param {array} fields - array of  required fields
   */
  async getByIds(ids, fields = []) {
    return new Promise((resolve) => {
      const projection = {};
      fields.map(field => projection[field] = 1);
      this.schema
        .find({
          status: { $in: [0, 1] },
          _id: { $in: ids }
        })
        .select(projection)
        .then((items) => {
          resolve(new Response(200, 'success', items));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }

  /**
   * @description - method to get list of documents based on some filters
   * @param {array} ids - array of encodeIds for which resources are needed
   * @param {array} fields - array of  required fields
   */
  async getByEncodeIds(ids, fields = []) {
    return new Promise((resolve) => {
      const projection = {};
      fields.map(field => projection[field] = 1);

      // Remove the _id from the projection if its not needed
      if (!fields.includes('_id')) {
        projection['_id'] = 0;
      }
      this.schema
        .find({
          status: { $in: [0, 1] },
          encodeId: { $in: ids }
        })
        .select(projection)
        .then((items) => {
          resolve(new Response(200, 'success', items));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }

  /**
   * @description - method to create and save item in database
   * @param {object} payload - the object containing data to be saved
   * @param {string|null} id - id of the object to be saved
   */
  async save(payload, id = null) {
    /**
     * checks if all the required fields are present and in correct shape
     */
    let { value, error } = this.validator(payload);

    if (id) {
      if (isValidObjectId(id)) {
        return new Promise(resolve => {
          this.schema.findOneAndUpdate(
            {
              _id: id,
              appId: this.appId,
            },
            value,
            { upsert: false, new: true, useFindAndModify: false }
          )
            .then((item) => {
              if (item === null) {
                resolve(new BadRequestResponse('id does not exists'));
              } else {
                resolve(new Response(201, 'updated', item));
              }
            })
            .catch(err => {
              console.log(err);
              resolve(new BadRequestResponse(err.message));
            });
        });
      } else {
        return new Promise(resolve => {
          resolve(new BadRequestResponse('invalid id'));
        });
      }
    }

    if (error) {
      return new BadRequestResponse(error.message);
    } else {
      return new Promise((resolve) => {
        new this.schema(value).save()
          .then((item) => {
            const statusMsg = id ? 'updated' : 'created';
            resolve(new Response(201, statusMsg, item));
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    }

  }

  /**
   * @description - method to create and save item in database
   * @param {string} id - id of the resource
   * @param {number} status - value of status to be set
   */
  async changeStatus(id, status) {
    if (isValidObjectId(id)) {
      return new Promise((resolve) => {
        this.schema.updateOne(
          {
            _id: id,
          },
          { $set: { status: status } },
          { upsert: false, new: true, useFindAndModify: false }
        )
          .then((item) => {
            resolve(status);
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    } else {
      return new Promise(resolve => {
        resolve(new BadRequestResponse('invalid id'));
      });
    }

  }

  /**
   * @description - method to create and save item in database
   * @param {string} id - encode id of the resource
   */
  async report(id) {
    if (isValidObjectId(id)) {
      return new Promise((resolve) => {
        this.schema.updateOne(
          {
            encodeId: id,
          },
          { $set: { reported: true } },
          { upsert: false, new: true, useFindAndModify: false }
        )
          .then(() => {
            resolve(new Response(201, 'Video Reported Successfully!'));
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    } else {
      return new Promise(resolve => {
        resolve(new BadRequestResponse('invalid video id'));
      });
    }
  }

  /**
   * @description - method to set a particular field of document
   * @param {string} id - id of the resource
   * @param {object} payload - payload to be set in the resource
   */
  async setField(payload, id) {
    const updateObj = {};

    for (const payloadKey in payload) {
      if (this.schemaObj.hasOwnProperty(payloadKey)) {
        updateObj[payloadKey] = payload[payloadKey];
      }
    }

    if (isValidObjectId(id)) {
      return new Promise((resolve) => {
        this.schema.findOneAndUpdate(
          {
            _id: id,
            appId: this.appId,
          },
          { $set: updateObj },
          { upsert: false, new: true, useFindAndModify: false }
        )
          .then((item) => {
            resolve(new Response(201, `updated`, item));
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    } else {
      return new Promise(resolve => {
        resolve(new BadRequestResponse('invalid id'));
      });
    }

  }
  /**
   * @description - method to get the values of particular keys from the document
   * @param {string} id - id of the resource
   * @param {array} keys - array of keys for which values need to be returned
   */
  async getFields(keys, id) {
    if (isValidObjectId(id)) {
      return new Promise((resolve) => {
        this.schema.findById(id)
          .then((item) => {
            const response = {};
            for (const key of keys) response[key] = item[key];
            resolve(new Response(200, `success`, response));
          })
          .catch((error) => {
            resolve(new BadRequestResponse(error.message));
          });
      });
    } else {
      return new Promise(resolve => {
        resolve(new BadRequestResponse('invalid id'));
      });
    }
  }
  /**
   * @description - method to get the values of particular keys from the document
   * @param {string} id - id of the resource
   * @param {string} key - name of the key in document
   */
  async getField(id, key) {
    if (isValidObjectId(id)) {
      return new Promise((resolve) => {
        this.schema.findById(id)
          .then((item) => {
            resolve(item[key]);
          })
          .catch((error) => {
            console.log(error);
            resolve(false);
          });
      });
    } else {
      return new Promise(resolve => {
        resolve(new BadRequestResponse('invalid id'));
      });
    }
  }
  /**
   * @description - method to get number of documents based on a fliter
   * @param {object} filter - filter for the query
   */
  async getCount(filter) {
    return new Promise((resolve) => {
      this.schema.count({
        status: { $in: [0, 1] },
        appId: this.appId,
        ...filter,
      })
        .then((num) => {
          resolve(num);
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }
  /**
   * @description - method to get number of documents based on a filter
   * @param {object} filter - filter for the query
   * @param {string} fieldName - fieldName whose summation is required
   */
  async getSumOfField(filter, fieldName) {
    return new Promise((resolve) => {
      this.schema.aggregate([
        { $match: { ...filter, appId: this.appId } },
        { $group: { _id: null, size: { $sum: '$' + fieldName } } }
      ])
        .then((items) => {
          console.log(items);
          resolve(new Response(
            201,
            `success`,
            items.length ? items[0][fieldName] : 0,
          ));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }
  /**
   * @description - generate dummy data
   * @param {array} criteria - array of conditions for the uniqueness
   * @param {string} existingResourceId - id of the existing resource
   */
  async exists(criteria, existingResourceId = '') {
    return new Promise((resolve) => {
      this.schema
        .aggregate([
          {
            $match: {
              $and: [
                { appId: ObjectId(this.appId) },
                { status: { $in: [0, 1] } },
                ...criteria,
              ]
            }
          }
        ])
        .then((items) => {
          console.log(items);
          const ids = items.map(item => String(item._id));
          resolve(ids.length > 0 ? !ids.includes(existingResourceId) : false);
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });
  }
  /**
   * @description - generate dummy data
   * @param {number} limit - number of items to be created
   * @param {[string]} ignoredFields - array of keys to be ignored
   * @param {object} custom - array of keys to be ignored
   */
  async generateDummyData(ignoredFields, custom, limit = 10) {
    const randomObjects = [];
    for (let i = 0; i < limit; i++) {
      randomObjects.push(dummy(
        this.schema,
        {
          returnDate: true,
          ignore: ignoredFields
        }
      ));
    }

    return new Promise((resolve) => {
      this.schema.insertMany(randomObjects)
        .then((items) => {
          resolve(new Response(201, 'created', items));
        })
        .catch((error) => {
          resolve(new BadRequestResponse(error.message));
        });
    });

  }
  /**
   * @description - the default validator for the payload
   * @return {array} - array of the fields of the resource schema
   */
  getResourceFields() {
    const keys = [];
    for (const pathObj in this.schema.schema.paths) {
      if (this.schema.schema.paths.hasOwnProperty(pathObj)) {
        keys.push(pathObj);
      }
    }
    return keys;
  }

  /**
   * @description - the default validator for the payload
   * @param {number} status - the payload object to be validated
   * @return {string} - success message corresponding to status
   */
  static getSuccessMessage(status) {
    let message = ''

    switch (status) {
      case 0:
        message = 'deactivated';
        break;
      case 1:
        message = 'activated';
        break;
      case 2:
        message = 'deleted';
        break;
    }

    return message;
  }
  /**
   * @description - the default validator for the payload
   * @param {object} payload - the payload object to be validated
   */
  static defaultValidator(payload) {
    return {
      value: payload,
      error: undefined,
    }
  }

  static mapOrder(array, order, key) {
    array.sort(function (a, b) {
      const A = a[key], B = b[key];
      if (order.indexOf(A) > order.indexOf(B)) {
        return 1;
      } else {
        return -1;
      }
    });
    return array;
  }
  /**
   * @description - adds video analytics such as views and viewTime to videos
   * @param {array} drives - array of drive items
   */
  async addVideoAnalytics(drives) {
    return new Promise(async (resolve) => {
      try {
        const videos = drives.filter(driveItem => driveItem.type === 'video');
        const encodeIds = videos.map(video => video.encodeId);

        const options = {
          url: `${process.env.BASE_VIDEO_ANALYTIC_URL}bulkVideosData`,
          method: 'post',
          data: {
            videos: encodeIds
          },
          headers: {
            "Content-Type": "application/json",
            "authorization": process.env.GLOBAL_JWT || 'global_jwt_fndsjkbgj23432fdfb',
          }
        };

        const analyticsResponse = await axios(options);// [ {_id: string, views: number, viewTime:number} ]
        const analytics = analyticsResponse.data.data;

        analytics.forEach((video) => {
          const driveItem = drives.find((driveItem) => video._id && driveItem.encodeId === video._id);
          if (driveItem) {
            driveItem.views = video.views;
            driveItem.viewTime = video.viewTime;
          }
        });

        resolve(drives);

      } catch (err) {
        resolve(false);
        logger.error(err.message);
        logger.error(`Error while adding video analytics stats to the videos`);
      }

    });

  }

}

export {Resource};

