
const {
  AttributePath,
  FunctionExpression,
} = require('@aws/dynamodb-expressions');

function asAttributePath(value) {
  if (value instanceof AttributePath) {
    return value;
  }
  return new AttributePath(value);
}

const filters = {
  and(...queries) {
    return {
      type: 'And',
      conditions: queries,
    };
  },

  or(...queries) {
    return {
      type: 'Or',
      conditions: queries,
    };
  },

  not(query) {
    return {
      type: 'Not',
      condition: query,
    };
  },

  equals(subject, value) {
    return {
      type: 'Equals',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  notEquals(subject, value) {
    return {
      type: 'NotEquals',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  lessThan(subject, value) {
    return {
      type: 'LessThan',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  lessThanOrEqualTo(subject, value) {
    return {
      type: 'LessThanOrEqualTo',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  greaterThan(subject, value) {
    return {
      type: 'GreaterThan',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  greaterThanOrEqualTo(subject, value) {
    return {
      type: 'GreaterThanOrEqualTo',
      subject: asAttributePath(subject),
      object: value,
    };
  },

  between(subject, lowerBound, upperBound) {
    return {
      type: 'Between',
      subject: asAttributePath(subject),
      lowerBound,
      upperBound,
    };
  },

  in(subject, ...values) {
    return {
      type: 'Membership',
      subject: asAttributePath(subject),
      values,
    };
  },

  // Functions
  fn(name, subject, ...params) {
    return new FunctionExpression(name, asAttributePath(subject), ...params);
  },

  attributeExists(path) {
    return new FunctionExpression('attribute_exists', asAttributePath(path));
  },

  attributeNotExists(path) {
    return new FunctionExpression('attribute_not_exists', asAttributePath(path));
  },

  attributeType(path, type) {
    return new FunctionExpression('attribute_type', asAttributePath(path), type);
  },

  beginsWith(path, substr) {
    return new FunctionExpression('begins_with', asAttributePath(path), substr);
  },

  contains(path, operand) {
    return new FunctionExpression('contains', asAttributePath(path), operand);
  },

  size(path) {
    return new FunctionExpression('size', asAttributePath(path));
  },

  relatedTo(relationName, entityId = null) {
    return {
      type: '@relatedTo',
      relation: relationName,
      entityId,
    };
  },

  notRelatedTo(relationName, entityId = null) {
    return {
      type: 'Not',
      condition: {
        type: '@relatedTo',
        relation: relationName,

        entityId,
      },
    };
  },

  like(path, value) {
    return {
      type: '@like',
      subject: asAttributePath(path),
      value,
    };
  },

  beginsLike(path, value) {
    return {
      type: '@beginsLike',
      subject: asAttributePath(path),
      value,
    };
  },

  containsLike(path, value) {
    return {
      type: '@containsLike',
      subject: asAttributePath(path),
      value,
    };
  },

  /**
   * Return if query is non empty
   * @param {Object} query
   */
  isEmpty(query) {
    if (!query) {
      return true;
    }
    if (Object.keys(query).length === 0) {
      return true;
    }
    if (query.condition && filters.isEmpty(query.condition)) {
      return true;
    }
    if (query.conditions && query.conditions.length === 0) {
      return true;
    }
    return false;
  },
};


module.exports = filters;
