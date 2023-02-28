import { Box, Button } from "@mui/material"
import { GridContainer, widgets } from "@ui-schema/ds-material"
import { createEmptyStore, createOrderedMap, injectPluginStack, isInvalid, relTranslator, storeUpdater, UIMetaProvider, UIStoreProvider } from "@ui-schema/ui-schema"
import React from "react"
import { useMemo } from "react"

export type SchemaRefResolver = (ref: string) => Promise<object | string>;


const GridStack = injectPluginStack(GridContainer)

// Clean up the schema a bit for better UX
function transformSchema(schema: object): object {
    return Object.fromEntries(Object.entries(schema).map(([k, v]) => {
        if (v["enum"]) {
            v["widget"] = "Select"
        }

        if (v["title"]) {
            delete v["title"]
        }

        switch (typeof v) {
            case "object":
                return [k, transformSchema(v)]
            default:
                return [k, v]
        }
    }))
}


async function createParamsSchema(refResolver: SchemaRefResolver, params: OpenRPCParam[]): Promise<object> {
    return transformSchema({
        "type": "object",
        "properties": Object.fromEntries(await Promise.all(params.map(async param => {
            if ('$ref' in param.schema) {
                const resolved = await refResolver(param.schema["$ref"])
                return [param.name,
                    (typeof resolved === "string" ? JSON.parse(resolved) : resolved),
                ]
            } else {
                return [param.name, param.schema]
            }
        })))
    })
}

export interface OpenRPCParam {
    name: string,
    schema: { "$ref": string } | object,
}

export interface OpenRPCMethod {
    name: string,
    params: OpenRPCParam[],
}

export interface IRPCSingleMethodUIProps {
    schemaRefResolver: SchemaRefResolver,
    submit: (formData: object) => void,
    rpcSchema: OpenRPCMethod,
}

export function RPCSingleMethodUI(props: IRPCSingleMethodUIProps) {
    const [schema, setSchema] = React.useState<Immutable.OrderedMap<any, any> | null>(null)

    const [store, setStore] = React.useState(() => createEmptyStore("object"));

    React.useEffect(() => {
        createParamsSchema(props.schemaRefResolver, props.rpcSchema.params).then(schema => {
            setSchema(createOrderedMap(schema))
        })
    }, [props.rpcSchema, props.schemaRefResolver])

    const onChange = React.useCallback((actions: any) => {
        setStore(storeUpdater(actions))
    }, [setStore])


    return (
        <Box>
            <h2>{props.rpcSchema.name}</h2>
            { schema !== null && <UIMetaProvider
                widgets={widgets}
                t={relTranslator}
            >
                <UIStoreProvider
                    store={store}
                    onChange={onChange}
                    showValidity={false}
                >
                    <GridStack isRoot schema={schema} />
                </UIStoreProvider>
            </UIMetaProvider> }
            { schema !== null && <Button variant="contained" sx={{ mt: 2 }} disabled={!!isInvalid(store.getValidity())} onClick={() => {
                if (!isInvalid(store.getValidity())) {
                    props.submit(store.valuesToJS() as object)
                }
            }}>Submit</Button> }
        </Box>
    )
}