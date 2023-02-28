import * as React from "react";

// "global" ui-config
import { UIMetaProvider, useUIMeta } from '@ui-schema/ui-schema/UIMeta';
// for data-stores / data-binding
import { UIStoreProvider, createEmptyStore, createStore } from '@ui-schema/ui-schema/UIStore';
import { storeUpdater } from '@ui-schema/ui-schema/storeUpdater';

// util for `PluginStack` rendering
import { injectPluginStack } from '@ui-schema/ui-schema/applyPluginStack';

// for deep immutables
import { createOrderedMap } from '@ui-schema/ui-schema/Utils/createMap';
// for `t` keyword support / basic in-schema translation
import { relTranslator } from '@ui-schema/ui-schema/Translate/relT';

import { GridContainer, widgets } from "@ui-schema/ds-material"
import { Box, Button } from "@mui/material";
import { isInvalid } from "@ui-schema/ui-schema";
import { useEffect } from "react";
import Immutable = require("immutable");


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
        "properties": await Promise.all(params.map(async param => {
            if ('$ref' in param.schema) {
                const resolved = await refResolver(param.schema["$ref"])
                return {
                    name: param.name,
                    ...(typeof resolved === "string" ? JSON.parse(resolved) : resolved),
                }
            } else {
                return param.schema
            }
        }))
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

    useEffect(() => {
        createParamsSchema(props.schemaRefResolver, props.rpcSchema.params).then(schema => {
            setSchema(createOrderedMap(schema))
        })
    }, [props.rpcSchema, props.schemaRefResolver])

    const onChange = React.useCallback((actions: any) => {
        setStore(storeUpdater(actions))
    }, [setStore])

    return (
        <Box>
            <UIMetaProvider
                widgets={widgets}
                t={relTranslator}
            >
                <UIStoreProvider
                    store={store}
                    onChange={onChange}
                    showValidity={true}
                >
                    { schema ? <GridStack isRoot schema={schema} /> : null }
                </UIStoreProvider>
            </UIMetaProvider>
            <Button variant="contained" sx={{ mt: 2 }} disabled={!!isInvalid(store.getValidity())} onClick={() => {
                if (!isInvalid(store.getValidity())) {
                    props.submit(store.valuesToJS() as object)
                }
            }} />
        </Box>
    )
}