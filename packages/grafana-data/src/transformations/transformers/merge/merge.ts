import { DataTransformerID } from '../ids';
import { DataTransformerInfo } from '../../../types/transformations';
import { DataFrame, Field } from '../../../types/dataFrame';
import { omit } from 'lodash';
import { ArrayVector } from '../../../vector/ArrayVector';
import { MutableDataFrame } from '../../../dataframe';

export interface MergeTransformerOptions {}

export const mergeTransformer: DataTransformerInfo<MergeTransformerOptions> = {
  id: DataTransformerID.merge,
  name: 'Merge series/tables',
  description: 'Merges multiple series/tables into a single serie/table',
  defaultOptions: {},
  transformer: (options: MergeTransformerOptions) => {
    return (data: DataFrame[]) => {
      if (!Array.isArray(data) || data.length <= 1) {
        return data;
      }

      const fieldByName: Record<string, Field> = {};
      const fieldPointerByName: Record<string, Record<number, number>> = {};

      for (let frameIndex = 0; frameIndex < data.length; frameIndex++) {
        const frame = data[frameIndex];

        for (let fieldIndex = 0; fieldIndex < frame.fields.length; fieldIndex++) {
          const field = frame.fields[fieldIndex];

          if (!fieldByName[field.name]) {
            fieldByName[field.name] = copyFieldStructure(field);
          }

          if (!fieldPointerByName[field.name]) {
            fieldPointerByName[field.name] = {};
          }

          fieldPointerByName[field.name][frameIndex] = fieldIndex;
        }
      }

      const keyFieldPointers = Object.keys(fieldPointerByName).filter(
        fieldName => Object.keys(fieldPointerByName[fieldName]).length === data.length
      );

      const factoryIndex = keyFieldPointers.reduce((index: Record<number, number[]>, fieldName) => {
        return Object.keys(fieldPointerByName[fieldName]).reduce((index: Record<number, number[]>, frameIndex) => {
          const fi = parseInt(frameIndex, 10);
          index[fi] = index[fi] || [];
          index[fi].push(fieldPointerByName[fieldName][fi]);
          return index;
        }, index);
      }, {});

      const keyFactory = (frameIndex: number, valueIndex: number): string => {
        return factoryIndex[frameIndex].reduce((key: string, fieldIndex: number) => {
          return key + String(data[frameIndex].fields[fieldIndex].values.get(valueIndex));
        }, '');
      };

      type FieldPointer = {
        frameIndex: number;
        valueIndex: number;
      };

      const fieldIndex: Record<string, FieldPointer[]> = {};

      for (let frameIndex = 0; frameIndex < data.length; frameIndex++) {
        const frame = data[frameIndex];

        for (let valueIndex = 0; valueIndex < frame.length; valueIndex++) {
          const key = keyFactory(frameIndex, valueIndex);
          fieldIndex[key] = fieldIndex[key] || [];
          fieldIndex[key].push({ frameIndex, valueIndex });
        }
      }

      const valueMapper = (key: string): Record<string, any> => {
        const pointers = fieldIndex[key];
        const values: Record<string, any> = {};

        for (const pointer of pointers) {
          const frame = data[pointer.frameIndex];

          for (const field of frame.fields) {
            if (!values[field.name]) {
              values[field.name] = field.values.get(pointer.valueIndex);
            }
          }
        }
        console.log('values', values);
        return values;
      };

      const sortedIndex = Object.keys(fieldIndex).sort((a, b) => a.localeCompare(b));
      console.log('order', sortedIndex);
      const dataFrame = new MutableDataFrame();

      for (const field of Object.values(fieldByName)) {
        console.log('field', field);
        dataFrame.addField(field);
      }

      for (const key of sortedIndex) {
        dataFrame.add(valueMapper(key));
      }

      // 1. find the union of all field names and all unique field names.
      // 2. create a factory function to create a key from those fields for each frame.
      // 3. create an index based on the key that has a list of pointers (frameindex, valueindex).
      // 4. sort the keys of that index.
      // 5. create a mutable data frame and add all the fields.
      // 6. add and merge all fields according to the index.
      // 7. return the new dataframe.

      return [dataFrame];
    };
  },
};

const copyFieldStructure = (field: Field) => {
  return {
    ...omit(field, ['values', 'state', 'labels', 'config']),
    values: new ArrayVector(),
    config: {
      ...omit(field.config, 'displayName'),
    },
  };
};
