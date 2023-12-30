import {
  GenericDataModel,
  GenericDocument,
  GenericSchema,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  SchemaDefinition,
  TableDefinition,
  TableNamesInDataModel,
} from "convex/server";
import {
  ObjectType,
  PropertyValidators,
  Validator,
  v as baseV,
} from "convex/values";

export function defineEnt<
  DocumentSchema extends Record<
    string,
    Validator<any, any, any> | EdgeValidator<any, any, any>
  >
>(
  documentSchema: DocumentSchema
): EntDefinition<
  ExtractDocument<ObjectValidator<DocumentSchema>>,
  ExtractFieldPaths<ObjectValidator<DocumentSchema>>
> {
  if (documentSchema instanceof Validator) {
    return new EntDefinitionImpl(documentSchema) as any;
  } else {
    return new EntDefinitionImpl(v.object(documentSchema)) as any;
  }
}

type GenericEdges<DataModel extends GenericDataModel> = Record<
  string,
  GenericEdgeConfig<DataModel>
>;

type GenericEdgeConfig<DataModel extends GenericDataModel> = {
  name: string;
  to: TableNamesInDataModel<DataModel>;
  cardinality: "single" | "multiple";
  type: "field" | "ref";
};

interface EntDefinition<
  Document extends GenericDocument = GenericDocument,
  FieldPaths extends string = string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  VectorIndexes extends GenericTableVectorIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  Edges extends GenericEdges<any> = {}
> extends TableDefinition<
    Document,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
  edge<EdgeName extends string>(
    edge: EdgeName
  ): EntDefinition<
    Document & { [key in `${EdgeName}Id`]: string },
    FieldPaths | `${EdgeName}Id`,
    Indexes,
    SearchIndexes,
    VectorIndexes,
    Edges & {
      [key in EdgeName]: {
        name: EdgeName;
        to: `${EdgeName}s`;
        type: "field";
        cardinality: "single";
      };
    }
  >;
  edge<EdgeName extends string>(
    edge: EdgeName,
    options: { optional: true }
  ): EntDefinition<
    Document,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes,
    Edges & {
      [key in EdgeName]: {
        name: EdgeName;
        to: `${EdgeName}s`;
        type: "ref";
        cardinality: "single";
      };
    }
  >;

  edges<EdgesName extends string>(
    edge: EdgesName
  ): EntDefinition<
    Document,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes,
    Edges & {
      [key in EdgesName]: {
        name: EdgesName;
        to: EdgesName;
        type: "ref";
        cardinality: "multiple";
      };
    }
  >;
  edges(table: string, options: EdgesOptions): this;
}

type EdgeOptions = {
  optional?: true;
};

type EdgesOptions = {
  name: string;
};

class EntDefinitionImpl {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private indexes: Index[];
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private searchIndexes: SearchIndex[];
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private vectorIndexes: VectorIndex[];
  // The type of documents stored in this table.
  private documentType: Validator<any, any, any>;

  private edgeConfigs: EdgeConfig[];

  constructor(documentType: Validator<any, any, any>) {
    this.indexes = [];
    this.searchIndexes = [];
    this.vectorIndexes = [];
    this.documentType = documentType;
    this.edgeConfigs = [];
  }

  searchIndex(name: any, indexConfig: any) {
    this.searchIndexes.push({
      indexDescriptor: name,
      searchField: indexConfig.searchField,
      filterFields: indexConfig.filterFields || [],
    });
    return this;
  }

  vectorIndex(name: any, indexConfig: any) {
    this.vectorIndexes.push({
      indexDescriptor: name,
      vectorField: indexConfig.vectorField,
      dimensions: indexConfig.dimensions,
      filterFields: indexConfig.filterFields || [],
    });
    return this;
  }

  /**
   * Export the contents of this definition.
   *
   * This is called internally by the Convex framework.
   * @internal
   */
  export() {
    return {
      indexes: this.indexes,
      searchIndexes: this.searchIndexes,
      vectorIndexes: this.vectorIndexes,
      documentType: (this.documentType as any).json,
    };
  }

  edge(table: string, options?: EdgeOptions): this {
    if (options === undefined) {
      this.edgeConfigs.push({
        name: table,
        to: table + "s",
        cardinality: "single",
        type: "field",
        field: table + "Id",
      });
      this.indexes.push({
        indexDescriptor: table + "Id",
        fields: [table + "Id"],
      });
      return this;
    }
    if (options.optional === true) {
      this.edgeConfigs.push({
        name: table,
        to: table + "s",
        cardinality: "single",
        type: "ref",
      });
    }
    return this;
  }

  edges(table: string, options?: EdgesOptions): this {
    if (options === undefined) {
      this.edgeConfigs.push({
        name: table,
        to: table,
        cardinality: "multiple",
        type: "ref",
      });
    }
    return this;
  }
}

export type EdgeConfig = {
  name: string;
  to: string;
  cardinality: "single" | "multiple";
} & (
  | {
      type: "field";
      field: string;
    }
  | { type: "ref" }
);

type ExtractDocument<T extends Validator<any, any, any>> =
  // Add the system fields to `Value` (except `_id` because it depends on
  //the table name) and trick TypeScript into expanding them.
  Expand<SystemFields & T["type"]>;

export type Expand<ObjectType extends Record<any, any>> =
  ObjectType extends Record<any, any>
    ? {
        [Key in keyof ObjectType]: ObjectType[Key];
      }
    : never;
type ExtractFieldPaths<T extends Validator<any, any, any>> =
  // Add in the system fields available in index definitions.
  // This should be everything except for `_id` because thats added to indexes
  // automatically.
  T["fieldPaths"] | keyof SystemFields;
export type SystemFields = {
  _creationTime: number;
};

type ObjectValidator<Validators extends PropertyValidators> = Validator<
  // Compute the TypeScript type this validator refers to.
  ObjectType<Validators>,
  false,
  // Compute the field paths for this validator. For every property in the object,
  // add on a field path for that property and extend all the field paths in the
  // validator.
  {
    [Property in keyof Validators]:
      | JoinFieldPaths<Property & string, Validators[Property]["fieldPaths"]>
      | Property;
  }[keyof Validators] &
    string
>;

type JoinFieldPaths<
  Start extends string,
  End extends string
> = `${Start}.${End}`;

const v = {
  ...baseV,
  edge: (tableName: string) => new EdgeValidator(v.id(tableName)),
};

class EdgeValidator<T, I extends boolean, P extends string> extends Validator<
  T,
  I,
  P
> {
  constructor(
    public validator: Validator<T, I, P>,
    private isIndexed: boolean = false
  ) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    super(validator.json, validator.isOptional);
  }

  indexed(): EdgeValidator<T, I, P> {
    return new EdgeValidator(this.validator, true);
  }
}

export type GenericEntsDataModel<DataModel extends GenericDataModel> = Record<
  TableNamesInDataModel<DataModel>,
  GenericEntModel<DataModel>
>;

export type GenericEntModel<DataModel extends GenericDataModel> = {
  edges: Record<string, GenericEdgeConfig<DataModel>>;
};

export type EntDataModelFromSchema<
  SchemaDef extends SchemaDefinition<any, boolean>
> = {
  [TableName in keyof SchemaDef["tables"] &
    string]: SchemaDef["tables"][TableName] extends EntDefinition<
    any,
    any,
    any,
    any,
    any,
    infer Edges
  >
    ? {
        edges: Edges;
      }
    : never;
};

export function getEntDefinition(tables: GenericSchema): any {
  return Object.keys(tables).reduce(
    (acc, tableName) => ({
      ...acc,
      [tableName]: {
        edges: (tables[tableName] as any).edgeConfigs,
      },
    }),
    {}
  ) as any;
}
