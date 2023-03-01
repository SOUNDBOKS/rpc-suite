import ts, { GenericType, ObjectFlags, SymbolFlags, TypeFlags } from "typescript";



export async function generateService(rootFile: string, rootServiceType: string): Promise<object> {
    const program = ts.createProgram([rootFile], {})
    const checker = program.getTypeChecker()



    const root = program.getSourceFile(rootFile)

    if (!root) throw new Error("Root source file not found in program")

    let rootNode: ts.InterfaceDeclaration | undefined = undefined;
    root.forEachChild(node => {
        if (ts.isInterfaceDeclaration(node)) {
            if (node.name.escapedText === rootServiceType) {
                rootNode = node;
            }
        }
    })

    if (rootNode === undefined) throw new Error(`${rootServiceType} does not exist in the root source file`)


    let rootSymbol = checker.getSymbolAtLocation((rootNode as ts.InterfaceDeclaration).name)!
    let methods: object[] = []

    const context: Context = {
        checker,
        definitions: new Map(),
        node: rootNode,
    }

    rootSymbol.members?.forEach(member => {
        const type = checker.getTypeOfSymbolAtLocation(member, rootNode!)

        if (type.flags !== TypeFlags.Object || type.symbol.flags !== SymbolFlags.Method) {
            console.warn("Skipping unimplemented type: ", { ...type, checker: null })
            return;
        }

        const method = generateMethod(context, member)
        if (method) {
            methods.push(method)
        }
    })

    return {
        info: {
            title: rootServiceType,
            version: "1.0.0",
        },
        openrpc: "1.0.0",
        methods,
        components: {
            contentDescriptors: Object.fromEntries(Array.from(context.definitions.entries()).map(([name, schema]) => {
                return [name, {
                    name: name,
                    schema,
                }]
            })),
        }
    }
}

interface Context {
    checker: ts.TypeChecker,
    definitions: Map<string, object>,
    node: ts.Node,
}

function generateMethod(context: Context, symbol: ts.Symbol): object | null {
    const method = context.checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)

    if (method.getCallSignatures().length != 1) {
        throw new Error("Currently does not support overloaded functions" + method)
    }

    const signature = method.getCallSignatures()[0]
    try {

        return {
            name: symbol.escapedName,
            params: signature.parameters.map(param => ({
                name: param.escapedName,
                schema: generateTypeSchema(context, context.checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration!))
            })),
            result: {
                name: symbol.escapedName,
                schema: generateTypeSchema(context, context.checker.getReturnTypeOfSignature(signature))
            }
        }
    } catch (e) {
        console.warn("error generating method: " + symbol.escapedName)
        console.warn((e as Error).message)
        return null
    }
}

function generateTypeSchema(context: Context, type: ts.Type): object {
    switch (type.flags) {
        case TypeFlags.Boolean:
        case TypeFlags.Boolean | TypeFlags.Union:
        case TypeFlags.BooleanLiteral: return { type: "boolean" };
        case TypeFlags.Number:
        case TypeFlags.NumberLiteral: return { type: "number" };
        case TypeFlags.String:
        case TypeFlags.StringLiteral: return { type: "string" };
        case TypeFlags.Void: return { type: "null" };
        case TypeFlags.Null: return { type: "null" };
        case TypeFlags.Any: return {}
    }

    if (type.flags === TypeFlags.Object && 'objectFlags' in type) {
        // microsoft is ******** incompetent and just leaks us some
        // hidden internal types sometimes. From manual observation it
        // seems this error is caused by generic function aliases, which
        // can't be translated into OpenRPC anyway, so we just ignore it
        if (((type.objectFlags as number) & (1 << 20)) !== 0) {
            throw new Error("Unsupported type: CouldContainTypeVariables")
        }

        switch (type.objectFlags as number) {
            case ObjectFlags.Reference:
                if (!('target' in type)) throw new Error("no")
                let target: ts.Type = type.target as ts.Type;

                if (type.symbol && (type.symbol.flags & SymbolFlags.Transient) !== 0) {
                    if (type.symbol.escapedName === "Promise") {
                        return generateTypeSchema(context, (type as any)["resolvedTypeArguments"][0])
                    }
            
                    if (type.symbol.escapedName === "Array") {
                        return {
                            type: "array",
                            members: generateTypeSchema(context, (type as any)["resolvedTypeArguments"][0])
                        }
                    }
                }

                return generateTypeSchema(context, target);
            case ObjectFlags.Class:
            case ObjectFlags.Class | ObjectFlags.Reference:
                throw new Error("Class types are intentionally unsupported")
            case ObjectFlags.Interface:
            case ObjectFlags.Interface | ObjectFlags.Reference:
                switch (type.symbol?.name) {
                    case "Buffer":
                    case "ArrayBuffer":
                    case "Uint8Array":
                    case "SharedArrayBuffer":
                        throw new Error("Unrepresentable type: " + type.symbol.name)
                }

                return generateDefinition(context, type.symbol)
            case ObjectFlags.Tuple:
            case ObjectFlags.Tuple | ObjectFlags.Reference:
                return {
                    type: "array",
                    prefixItems: []
                }
            case ObjectFlags.Anonymous:
                switch (type.symbol.flags) {
                    case SymbolFlags.TypeLiteral:
                        return generateObjectType(context, type.symbol.members!)
                    default:
                        throw new Error("Unimplemented anonymous symbol type: " + type.symbol.flags)
                };
                case ObjectFlags.Tuple:
        }

        console.warn("Unimplemented object type: " + (type as any).objectFlags)
        throw new Error("Unimplemented object type")
    }

    
    if (
        (type.flags & TypeFlags.EnumLiteral) !== 0) {
            return generateDefinition(context, type.symbol)
        }
        
    if ((type.flags & TypeFlags.Union) !== 0 && 'types' in type) {
        return {
            "oneOf": (type.types as ts.Type[]).map(t => generateTypeSchema(context, t))
        }
    }

    if ((type.flags & TypeFlags.Intersection) !== 0) {
        throw new Error("Intersection types are not implemented at the current time")
    }
    
    console.warn("unimplemented type: " + type.flags)
    throw new Error("Unimplemented type")
}

function generateObjectType(context: Context, members: ts.SymbolTable) {
    const properties: [string, object][] = []

    members.forEach(member => {
        if ((member.flags & SymbolFlags.Method) !== 0) {
            return;
        }

        properties.push([
            member.escapedName.toString(),
            generateTypeSchema(context, context.checker.getTypeOfSymbolAtLocation(member, member.valueDeclaration!))
        ])
    })

    return {
        type: "object",
        properties: Object.fromEntries(properties),
    }
}

function generateDefinition(context: Context, symbol: ts.Symbol) {
    if (context.definitions.has(symbol.escapedName.toString())) {
        return {
            "$ref": "#/components/contentDescriptors/" + symbol.escapedName + "/schema",
        }
    }

    switch (symbol.flags & (~SymbolFlags.FunctionScopedVariable)) {
        case SymbolFlags.RegularEnum:
            const members: string[] = []
            symbol.exports!.forEach(thing => {
                if (thing.flags !== SymbolFlags.EnumMember) {
                    throw new Error("Nontrivial enums are not yet implemented")
                }

                members.push(thing.escapedName.toString())
            })

            context.definitions.set(symbol.escapedName.toString(), {
                type: "string",
                enum: members,
            })
            break;
        case SymbolFlags.Enum:
            console.log(symbol)
            process.exit(0)
            break;
        case SymbolFlags.EnumMember:
            console.log(symbol)
            process.exit(0)
            break;
        case SymbolFlags.Interface:
        case SymbolFlags.Class:
        case SymbolFlags.Class | SymbolFlags.ValueModule:
        case SymbolFlags.Interface | SymbolFlags.Transient:
            context.definitions.set(symbol.escapedName.toString(), generateObjectType(context, symbol.members!))
            break;
        default:
            throw new Error("Unimplemented symbol type: " + symbol.flags)
    }

    return {
        "$ref": "#/components/contentDescriptors/" + symbol.escapedName + "/schema",
    }
}

function logType(type: ts.Type) {
    console.log({ ...type, checker: null })
}