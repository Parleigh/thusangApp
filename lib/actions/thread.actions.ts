"use server"

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";
import { ThreadValidation } from "../validations/thread";
import { threadId } from "worker_threads";

interface Params {
    text: string,
    author: string,
    communityId: string | null,
    path: string,
}

export async function createThreat({ text, author, communityId, path }: Params){
    
    try {
        connectToDB();

        const createdThread = await Thread.create({
            text, 
            author,
            community: null,
        });

        //Update User model 
        
        await User.findByIdAndUpdate(author, {
            $push:{threads: createdThread._id}
        })

        revalidatePath(path);

    } catch(error: any){
        throw new Error(`Error creating thread: ${error.message}`);
    }
    
    
}

export async function fetchPosts(pageNumber = 1, pageSize = 20){
    connectToDB();

    //Calculate the number of posts to skip
    const skipAmount = (pageNumber - 1) * pageSize;

    //Top level threads/ no parents
    const postsQuery = Thread.find({parentId: {$in: [null, undefined]}})
    .sort({createAt: 'desc'})
    .skip(skipAmount)
    .limit(pageSize)
    .populate({path: 'author', model: User})
    .populate({
        path: 'children',
        populate: {
            path: 'author',
            model: User,
            select: "_id name parentId image"
        }
    
    })

    const totalPostsCount = await Thread.countDocuments({parentId: {$in: [null, undefined]}})

    const posts = await postsQuery.exec();

    const isNext = totalPostsCount > skipAmount + posts.length;

    return {posts, isNext}

}


export async function fetchThreadById(threadId: string){
    connectToDB();

    try{

        //TODO populate community

        const thread = await Thread.findById(threadId)
            .populate({
                path: 'author',
                model: User,
                select: "_id id name image" 
            })
            .populate({
                path: 'children',
                populate: [
                    {
                        path: 'author',
                        model: User,
                        select: "_id id name parentId image"
                    },
                    {
                        path: 'children',
                        model: Thread,
                        populate:{
                            path: 'author',
                            model: User,
                            select: "_id id name parentId image"

                        }
                    }
                       
                ]

            }).exec();

            return thread;

    } catch(error: any){
        throw new Error (`Error fetching threadCo: ${error.message}`)
    }
}


export async function addCommentToThread(
    threadId: string,
    commentText: string,
    userId: string,
    path: string,
){
    connectToDB();

    try{
        //find Original thread by ID
        const originalThread =  await Thread.findById(threadId);   
        
        if(!originalThread){
            throw new Error("Thread not found");
        }

        //Create new thread with comment text
        const commentThread = new Thread({
            text: commentText,
            author: userId,
            parentId: threadId,
        })

        //Save new thread
        const savedCommentThread = await commentThread.save();

        //Update the original thread to include the new comment
        originalThread.children.push(savedCommentThread._id);

        //Save original thread
        await originalThread.save();

        revalidatePath(path);

    } catch(error: any) {
        throw new Error(`Error adding comment: ${error.messag}`);

    }

}